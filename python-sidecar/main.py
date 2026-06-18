#!/usr/bin/env python3
"""
CrossPost Desktop — Python Sidecar
Обрабатывает все платформы: Instagram, Facebook, LinkedIn, Twitter/X, Email, Telegram
Запускается как дочерний процесс Tauri, общается через stdin/stdout JSON
"""

import sys
import json
import asyncio
import logging
import pathlib
import random
import time
from typing import Any

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("crosspost-sidecar")

# ─── Session cache helpers ────────────────────────────────────────────────────

def _sessions_dir() -> pathlib.Path:
    d = pathlib.Path.home() / ".crosspost" / "sessions"
    d.mkdir(parents=True, exist_ok=True)
    return d

def _ig_cache(username: str) -> pathlib.Path:
    return _sessions_dir() / f"ig_{username}.json"


# ─── Human-like delays ────────────────────────────────────────────────────────

def human_delay(min_sec: float = 2.5, max_sec: float = 8.0):
    """Имитация паузы реального пользователя перед действием"""
    delay = random.uniform(min_sec, max_sec)
    logger.info(f"Human delay: {delay:.1f}s")
    time.sleep(delay)

def typing_delay(text: str):
    """Имитация времени набора текста (~40 слов/минуту)"""
    words = len(text.split())
    delay = (words / 40) * 60 * random.uniform(0.8, 1.2)
    delay = max(1.0, min(delay, 15.0))  # от 1 до 15 секунд
    time.sleep(delay)


# ─── Platform handlers ────────────────────────────────────────────────────────

class InstagramHandler:
    """Instagram + Facebook через Instagrapi"""

    def _client(self, session_or_creds: dict):
        """Return authenticated Instagrapi Client.

        Accepts either raw credentials {username, password} or saved Instagrapi settings.
        Username/password path uses a file cache to avoid full re-login on every call.
        """
        from instagrapi import Client
        cl = Client()

        username = session_or_creds.get("username")
        password = session_or_creds.get("password")

        if username and password:
            cache = _ig_cache(username)
            if cache.exists():
                try:
                    cl.load_settings(cache)
                    cl.login(username, password)  # refreshes token silently
                    cl.dump_settings(cache)
                    return cl
                except Exception:
                    cache.unlink(missing_ok=True)
            cl.login(username, password)
            cl.dump_settings(cache)
        else:
            cl.set_settings(session_or_creds)
        return cl

    def connect(self, credentials: dict) -> dict:
        try:
            cl = self._client(credentials)
            info = cl.account_info()
            session_data = cl.get_settings()
            return {
                "success": True,
                "session": session_data,
                "profile": {"name": info.full_name, "username": info.username},
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_messages(self, session: dict, limit: int = 20) -> dict:
        try:
            cl = self._client(session)
            threads = cl.direct_threads(amount=limit)
            messages = []
            for thread in threads:
                for msg in thread.messages[:5]:
                    messages.append({
                        "id": str(msg.id),
                        "conversation_id": str(thread.id),
                        "sender_name": thread.users[0].username if thread.users else "Unknown",
                        "sender_id": str(thread.users[0].pk) if thread.users else "",
                        "content": msg.text or "",
                        "direction": "incoming",
                        "created_at": msg.timestamp.isoformat() if msg.timestamp else ""
                    })
            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def send_message(self, session: dict, user_id: str, text: str) -> dict:
        try:
            cl = self._client(session)
            human_delay()
            typing_delay(text)
            cl.direct_send(text, [int(user_id)])
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def post_content(self, session: dict, content: str, media_path: str = None) -> dict:
        try:
            cl = self._client(session)
            human_delay(3.0, 10.0)
            if media_path:
                media = cl.photo_upload(media_path, content)
                return {"success": True, "post_id": str(media.pk)}
            else:
                # Instagram требует медиа для поста — только caption без фото нельзя
                return {"success": False, "error": "Instagram требует изображение или видео"}
        except Exception as e:
            return {"success": False, "error": str(e)}


class LinkedInHandler:
    """LinkedIn через linkedin-api"""
    
    def connect(self, credentials: dict) -> dict:
        try:
            from linkedin_api import Linkedin
            api = Linkedin(credentials["email"], credentials["password"])
            profile = api.get_profile()
            return {
                "success": True,
                "profile": {
                    "name": f"{profile.get('firstName', '')} {profile.get('lastName', '')}",
                    "username": profile.get("publicIdentifier", "")
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            from linkedin_api import Linkedin
            api = Linkedin(credentials["email"], credentials["password"])
            conversations = api.get_conversations()
            messages = []
            for conv in conversations.get("elements", [])[:limit]:
                events = conv.get("events", [])
                if events:
                    last = events[0]
                    messages.append({
                        "id": conv.get("entityUrn", ""),
                        "conversation_id": conv.get("entityUrn", ""),
                        "sender_name": last.get("from", {}).get("com.linkedin.voyager.messaging.MessagingMember", {}).get("miniProfile", {}).get("firstName", ""),
                        "content": last.get("eventContent", {}).get("com.linkedin.voyager.messaging.event.MessageEvent", {}).get("body", ""),
                        "direction": "incoming",
                        "created_at": str(last.get("createdAt", ""))
                    })
            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def post_content(self, credentials: dict, content: str) -> dict:
        try:
            from linkedin_api import Linkedin
            api = Linkedin(credentials["email"], credentials["password"])
            human_delay(3.0, 12.0)
            # LinkedIn post через API
            profile = api.get_profile()
            urn = profile.get("entityUrn", "")
            api.post(content, urn=urn)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


class TwitterHandler:
    """Twitter/X через Tweepy"""
    
    def connect(self, credentials: dict) -> dict:
        try:
            import tweepy
            client = tweepy.Client(
                consumer_key=credentials["api_key"],
                consumer_secret=credentials["api_secret"],
                access_token=credentials["access_token"],
                access_token_secret=credentials["access_secret"]
            )
            me = client.get_me()
            return {
                "success": True,
                "profile": {
                    "name": me.data.name,
                    "username": me.data.username
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            import tweepy
            client = tweepy.Client(
                consumer_key=credentials["api_key"],
                consumer_secret=credentials["api_secret"],
                access_token=credentials["access_token"],
                access_token_secret=credentials["access_secret"]
            )
            dms = client.get_direct_message_events(max_results=limit)
            messages = []
            if dms.data:
                for dm in dms.data:
                    messages.append({
                        "id": dm.id,
                        "conversation_id": dm.dm_conversation_id,
                        "content": dm.text,
                        "direction": "incoming",
                        "created_at": str(dm.created_at)
                    })
            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def post_content(self, credentials: dict, content: str) -> dict:
        try:
            import tweepy
            client = tweepy.Client(
                consumer_key=credentials["api_key"],
                consumer_secret=credentials["api_secret"],
                access_token=credentials["access_token"],
                access_token_secret=credentials["access_secret"]
            )
            human_delay(2.0, 6.0)
            # Twitter ограничение 280 символов
            if len(content) > 280:
                content = content[:277] + "..."
            tweet = client.create_tweet(text=content)
            return {"success": True, "post_id": str(tweet.data["id"])}
        except Exception as e:
            return {"success": False, "error": str(e)}


class TelegramHandler:
    """Telegram через Telethon"""
    
    def connect(self, credentials: dict) -> dict:
        try:
            from telethon.sync import TelegramClient
            from telethon import functions
            client = TelegramClient(
                f"sessions/telegram_{credentials['phone']}",
                credentials["api_id"],
                credentials["api_hash"]
            )
            client.connect()
            if not client.is_user_authorized():
                client.send_code_request(credentials["phone"])
                return {"success": False, "error": "code_required", "phone": credentials["phone"]}
            me = client.get_me()
            client.disconnect()
            return {
                "success": True,
                "profile": {
                    "name": f"{me.first_name} {me.last_name or ''}".strip(),
                    "username": me.username or ""
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            from telethon.sync import TelegramClient
            client = TelegramClient(
                f"sessions/telegram_{credentials['phone']}",
                credentials["api_id"],
                credentials["api_hash"]
            )
            client.connect()
            messages = []
            for dialog in client.iter_dialogs(limit=10):
                for msg in client.iter_messages(dialog.entity, limit=3):
                    if msg.text:
                        messages.append({
                            "id": str(msg.id),
                            "conversation_id": str(dialog.id),
                            "sender_name": dialog.name,
                            "content": msg.text,
                            "direction": "incoming" if not msg.out else "outgoing",
                            "created_at": msg.date.isoformat()
                        })
            client.disconnect()
            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def post_content(self, credentials: dict, channel: str, content: str) -> dict:
        try:
            from telethon.sync import TelegramClient
            client = TelegramClient(
                f"sessions/telegram_{credentials['phone']}",
                credentials["api_id"],
                credentials["api_hash"]
            )
            client.connect()
            human_delay(1.0, 4.0)
            client.send_message(channel, content)
            client.disconnect()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


class EmailHandler:
    """Email через SMTP/IMAP"""
    
    def connect(self, credentials: dict) -> dict:
        try:
            import imaplib
            imap = imaplib.IMAP4_SSL(credentials["imap_host"], int(credentials.get("imap_port", 993)))
            imap.login(credentials["email"], credentials["password"])
            imap.logout()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            import imaplib
            import email
            from email.header import decode_header
            
            imap = imaplib.IMAP4_SSL(credentials["imap_host"], int(credentials.get("imap_port", 993)))
            imap.login(credentials["email"], credentials["password"])
            imap.select("INBOX")
            
            _, msg_ids = imap.search(None, "ALL")
            msg_ids = msg_ids[0].split()[-limit:]
            
            messages = []
            for msg_id in reversed(msg_ids):
                _, data = imap.fetch(msg_id, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])
                
                subject = decode_header(msg["Subject"])[0][0]
                if isinstance(subject, bytes):
                    subject = subject.decode()
                
                sender = msg.get("From", "")
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                            break
                else:
                    body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
                
                messages.append({
                    "id": msg_id.decode(),
                    "conversation_id": msg.get("Message-ID", ""),
                    "sender_name": sender,
                    "content": f"**{subject}**\n\n{body[:500]}",
                    "direction": "incoming",
                    "created_at": msg.get("Date", "")
                })
            
            imap.logout()
            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def send_message(self, credentials: dict, to: str, subject: str, body: str) -> dict:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            msg = MIMEMultipart()
            msg["From"] = credentials["email"]
            msg["To"] = to
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain", "utf-8"))
            
            human_delay(1.0, 3.0)
            
            with smtplib.SMTP_SSL(credentials["smtp_host"], int(credentials.get("smtp_port", 465))) as server:
                server.login(credentials["email"], credentials["password"])
                server.send_message(msg)
            
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


class AIHandler:
    """AI генерация контента — Anthropic, OpenAI, Gemini"""
    
    def generate_content(self, provider: str, api_key: str, prompt: str, platform: str) -> dict:
        platform_hints = {
            "instagram": "Instagram Post: ansprechend, mit Emojis, max 2200 Zeichen, mit relevanten Hashtags",
            "facebook": "Facebook Post: informativ, mittellang, mit Handlungsaufforderung",
            "linkedin": "LinkedIn Post: professionell, sachlich, Mehrwert für Business-Netzwerk",
            "twitter": "Twitter/X Post: prägnant, max 280 Zeichen, ein Hashtag",
            "telegram": "Telegram Nachricht: direkt und klar",
            "email": "E-Mail: professionell, klare Betreffzeile, strukturierter Text"
        }
        
        hint = platform_hints.get(platform, "")
        full_prompt = f"Erstelle einen {hint} über folgendes Thema: {prompt}\n\nNur den Post-Text, keine Erklärungen."
        
        try:
            if provider == "anthropic":
                import anthropic
                client = anthropic.Anthropic(api_key=api_key)
                response = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1000,
                    messages=[{"role": "user", "content": full_prompt}]
                )
                return {"success": True, "content": response.content[0].text}
            
            elif provider == "openai":
                import openai
                client = openai.OpenAI(api_key=api_key)
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "user", "content": full_prompt}]
                )
                return {"success": True, "content": response.choices[0].message.content}
            
            elif provider == "gemini":
                import google.generativeai as genai
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-1.5-pro")
                response = model.generate_content(full_prompt)
                return {"success": True, "content": response.text}
            
            else:
                return {"success": False, "error": f"Unknown provider: {provider}"}
        
        except Exception as e:
            return {"success": False, "error": str(e)}


# ─── Message Router ────────────────────────────────────────────────────────────

handlers = {
    "instagram": InstagramHandler(),
    "facebook": InstagramHandler(),  # Instagrapi handles both
    "linkedin": LinkedInHandler(),
    "twitter": TwitterHandler(),
    "telegram": TelegramHandler(),
    "email": EmailHandler(),
    "ai": AIHandler(),
}

def handle_command(command: dict) -> dict:
    """Роутер команд от Tauri"""
    action = command.get("action")
    platform = command.get("platform")
    params = command.get("params", {})
    
    try:
        handler = handlers.get(platform)
        if not handler:
            return {"success": False, "error": f"Unknown platform: {platform}"}
        
        method = getattr(handler, action, None)
        if not method:
            return {"success": False, "error": f"Unknown action: {action}"}
        
        return method(**params)
    
    except Exception as e:
        logger.error(f"Error handling command: {e}")
        return {"success": False, "error": str(e)}


# ─── Main loop ────────────────────────────────────────────────────────────────

def main():
    """Читаем команды из stdin, отвечаем в stdout (JSON lines)"""
    logger.info("CrossPost Python sidecar started")
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            command = json.loads(line)
            result = handle_command(command)
            print(json.dumps(result), flush=True)
        
        except json.JSONDecodeError as e:
            error = {"success": False, "error": f"Invalid JSON: {e}"}
            print(json.dumps(error), flush=True)
        
        except Exception as e:
            error = {"success": False, "error": str(e)}
            print(json.dumps(error), flush=True)


if __name__ == "__main__":
    main()
