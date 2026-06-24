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
import os
from typing import Any

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("crosspost-sidecar")

# ─── Telegram API credentials ─────────────────────────────────────────────────
# Injected at build time via _constants.py (created by CI from GitHub Secrets).
# Fallback to environment variables for local dev.
try:
    from _constants import TELEGRAM_API_ID, TELEGRAM_API_HASH  # type: ignore
except ImportError:
    TELEGRAM_API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
    TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")

# ─── Email IMAP/SMTP auto-detect ──────────────────────────────────────────────
_IMAP_SMTP = {
    "gmail.com":     ("imap.gmail.com",              "smtp.gmail.com"),
    "googlemail.com":("imap.gmail.com",              "smtp.gmail.com"),
    "outlook.com":   ("outlook.office365.com",        "smtp.office365.com"),
    "hotmail.com":   ("outlook.office365.com",        "smtp.office365.com"),
    "live.com":      ("outlook.office365.com",        "smtp.office365.com"),
    "msn.com":       ("outlook.office365.com",        "smtp.office365.com"),
    "yahoo.com":     ("imap.mail.yahoo.com",          "smtp.mail.yahoo.com"),
    "yahoo.de":      ("imap.mail.yahoo.com",          "smtp.mail.yahoo.com"),
    "icloud.com":    ("imap.mail.me.com",             "smtp.mail.me.com"),
    "me.com":        ("imap.mail.me.com",             "smtp.mail.me.com"),
    "gmx.de":        ("imap.gmx.net",                 "mail.gmx.net"),
    "gmx.net":       ("imap.gmx.net",                 "mail.gmx.net"),
    "gmx.at":        ("imap.gmx.net",                 "mail.gmx.net"),
    "web.de":        ("imap.web.de",                  "smtp.web.de"),
    "t-online.de":   ("secureimap.t-online.de",       "securesmtp.t-online.de"),
    "freenet.de":    ("mx.freenet.de",                "mx.freenet.de"),
    "posteo.de":     ("posteo.de",                    "posteo.de"),
    "tutanota.com":  ("mail.tutanota.com",            "mail.tutanota.com"),
}

def _detect_email_servers(email: str) -> tuple:
    domain = email.split("@")[-1].lower().strip()
    default_imap = f"imap.{domain}"
    default_smtp = f"smtp.{domain}"
    return _IMAP_SMTP.get(domain, (default_imap, default_smtp))

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
        """credentials = {"access_token": "...", "user_id": "...", "platform": "..."}"""
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

    def get_posts(self, session: dict = None, credentials: dict = None, limit: int = 10) -> dict:
        try:
            data = session or credentials or {}
            cl = self._client(data)
            medias = cl.user_medias(cl.user_id, amount=limit)
            posts = []
            for m in medias:
                posts.append({
                    "id": str(m.id),
                    "text": m.caption_text or "",
                    "media_url": str(m.thumbnail_url or "") if hasattr(m, "thumbnail_url") else "",
                    "created_at": str(m.taken_at) if hasattr(m, "taken_at") else "",
                })
            return {"success": True, "posts": posts}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_messages(self, session: dict, limit: int = 20) -> dict:
        try:
            cl = self._client(session)
            threads = cl.direct_threads(amount=limit)
            messages = []

            if platform == "instagram":
                user_id = credentials.get("user_id", "")
                data = self._get(f"{user_id}/conversations", token, {
                    "platform": "instagram",
                    "fields": "participants,messages{message,from,created_time}"
                })
                for conv in data.get("data", [])[:limit]:
                    for msg in conv.get("messages", {}).get("data", []):
                        sender = msg.get("from", {})
                        messages.append({
                            "id": msg.get("id", ""),
                            "conversation_id": conv.get("id", ""),
                            "sender_name": sender.get("name", ""),
                            "sender_id": sender.get("id", ""),
                            "content": msg.get("message", ""),
                            "direction": "incoming",
                            "created_at": msg.get("created_time", "")
                        })
            else:
                # Facebook Messenger — get page conversations
                data = self._get("me/conversations", token, {
                    "fields": "participants,messages{message,from,created_time}"
                })
                for conv in data.get("data", [])[:limit]:
                    for msg in conv.get("messages", {}).get("data", []):
                        sender = msg.get("from", {})
                        messages.append({
                            "id": msg.get("id", ""),
                            "conversation_id": conv.get("id", ""),
                            "sender_name": sender.get("name", ""),
                            "sender_id": sender.get("id", ""),
                            "content": msg.get("message", ""),
                            "direction": "incoming",
                            "created_at": msg.get("created_time", "")
                        })

            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def send_message(self, credentials: dict, user_id: str, text: str) -> dict:
        try:
            cl = self._client(session)
            human_delay()
            typing_delay(text)
            result = self._post_json(f"{ig_user_id}/messages", token, {
                "recipient": json.dumps({"id": user_id}),
                "message": json.dumps({"text": text})
            })
            if "error" in result:
                return {"success": False, "error": result["error"].get("message", "Fehler")}
            return {"success": True, "message_id": result.get("message_id", "")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def post_content(self, credentials: dict = None, session: dict = None, content: str = "", media_path: str = None) -> dict:
        try:
            cl = self._client(credentials or session)
            human_delay(3.0, 10.0)

            if platform == "instagram":
                ig_user_id = credentials.get("user_id", "")
                if media_path:
                    # Step 1: create media container
                    container = self._post_json(f"{ig_user_id}/media", token, {
                        "image_url": media_path,  # must be public URL
                        "caption": content
                    })
                    container_id = container.get("id")
                    if not container_id:
                        return {"success": False, "error": "Media-Container konnte nicht erstellt werden"}
                    # Step 2: publish
                    result = self._post_json(f"{ig_user_id}/media_publish", token, {
                        "creation_id": container_id
                    })
                    return {"success": True, "post_id": result.get("id", "")}
                else:
                    return {"success": False, "error": "Instagram erfordert ein Bild oder Video für Posts"}

            else:
                # Facebook Page post
                result = self._post_json("me/feed", token, {"message": content})
                if "error" in result:
                    return {"success": False, "error": result["error"].get("message", "Fehler")}
                return {"success": True, "post_id": result.get("id", "")}

        except Exception as e:
            return {"success": False, "error": str(e)}


class LinkedInHandler:
    """LinkedIn через linkedin-api"""

    def _linkedin_check_auth(self, li_at: str):
        """Check if li_at cookie is valid by requesting the feed page (no CSRF needed for GET)."""
        import requests, re
        resp = requests.get(
            "https://www.linkedin.com/feed/",
            cookies={"li_at": li_at},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            allow_redirects=False,
            timeout=15
        )
        if resp.status_code in (301, 302, 303, 307, 308):
            return None, None, None  # redirected to login = invalid cookie
        if resp.status_code != 200:
            return None, None, None
        # Try to extract name from embedded JSON in page HTML
        html = resp.text
        first = last = slug = ""
        m = re.search(r'"firstName"\s*:\s*"([^"]+)"', html)
        if m: first = m.group(1)
        m = re.search(r'"lastName"\s*:\s*"([^"]+)"', html)
        if m: last = m.group(1)
        m = re.search(r'"publicIdentifier"\s*:\s*"([^"]+)"', html)
        if m: slug = m.group(1)
        return first or "LinkedIn", last or "Nutzer", slug

    def _get_api(self, credentials: dict):
        """Return authenticated Linkedin API instance (cookie or password)."""
        from linkedin_api import Linkedin
        li_at = credentials.get("li_at", "").strip()
        if li_at:
            return Linkedin("", "", cookies={"li_at": li_at}, authenticate=False)
        email = credentials.get("email", "")
        password = credentials.get("password", "")
        if not email or not password:
            raise ValueError("Bitte E-Mail und Passwort oder li_at Cookie angeben.")
        return Linkedin(email, password)

    def connect(self, credentials: dict) -> dict:
        try:
            li_at = credentials.get("li_at", "").strip()
            if li_at:
                first, last, slug = self._linkedin_check_auth(li_at)
                if first is None:
                    return {"success": False, "error": "li_at Cookie abgelaufen oder ungültig. Bitte erneut aus dem Browser kopieren: F12 → Application → Cookies → linkedin.com → li_at"}
                return {
                    "success": True,
                    "profile": {"name": f"{first} {last}".strip(), "username": slug or ""}
                }
            # Email/password path
            from linkedin_api import Linkedin
            api = Linkedin(credentials["email"], credentials["password"])
            profile = api.get_profile()
            return {
                "success": True,
                "profile": {
                    "name": f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip(),
                    "username": profile.get("publicIdentifier", "")
                }
            }
        except Exception as e:
            err = str(e)
            if "CHALLENGE" in err.upper():
                return {"success": False, "error": "LinkedIn Sicherheitscheck. Bitte Browser-Cookie verwenden (li_at aus F12 → Application → Cookies)."}
            if "401" in err or "Unauthorized" in err or "403" in err:
                return {"success": False, "error": "Zugang verweigert. Cookie prüfen oder E-Mail/Passwort."}
            if "JSONDecodeError" in type(e).__name__ or "Expecting value" in err:
                return {"success": False, "error": "LinkedIn hat keine gültige Antwort gesendet. Bitte li_at Cookie erneut kopieren — möglicherweise abgelaufen."}
            return {"success": False, "error": f"LinkedIn Fehler: {err}"}
    
    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            api = self._get_api(credentials)
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
    
    def _get_posts_via_cookie(self, li_at: str, jsessionid: str, limit: int) -> dict:
        """Fetch own posts using li_at + JSESSIONID via LinkedIn Voyager API."""
        import requests, re

        jsession = jsessionid.strip('"')
        all_cookies = {"li_at": li_at, "JSESSIONID": f'"{jsession}"'}
        HEADERS = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "de-DE,de;q=0.9",
        }
        html = ""

        if not jsession:
            return {"success": False, "error": "LinkedIn CSRF-Token nicht erhalten. Bitte li_at Cookie erneuern."}

        # Get publicIdentifier + entityUrn from Voyager /me
        voyager_headers = {
            "Accept": "application/vnd.linkedin.normalized+json+2.1",
            "csrf-token": jsession,
            "x-restli-protocol-version": "2.0.0",
            "x-li-lang": "de_DE",
            **HEADERS,
        }
        public_id = ""
        profile_entity_id = ""
        try:
            me_resp = requests.get(
                "https://www.linkedin.com/voyager/api/me",
                cookies=all_cookies,
                headers=voyager_headers,
                timeout=15,
            )
            if me_resp.text.strip():
                me_data = me_resp.json()
                for item in me_data.get("included", []):
                    if not public_id:
                        public_id = item.get("publicIdentifier", "")
                    urn = item.get("entityUrn", "")
                    if not profile_entity_id and ("miniProfile" in urn or "fsd_profile" in urn):
                        profile_entity_id = urn.split(":")[-1]
                    if public_id and profile_entity_id:
                        break
                if not public_id:
                    mini = me_data.get("data", {}).get("miniProfile", {})
                    if isinstance(mini, dict):
                        public_id = mini.get("publicIdentifier", "")
                if not profile_entity_id:
                    mini_urn = (me_data.get("data", {}).get("*miniProfile", "")
                                or me_data.get("data", {}).get("entityUrn", ""))
                    if mini_urn:
                        profile_entity_id = mini_urn.split(":")[-1]
        except Exception:
            pass

        # Fallback: regex on the feed HTML
        if not public_id:
            for pattern in [r'"publicIdentifier"\s*:\s*"([^"]+)"', r'"vanityName"\s*:\s*"([^"]+)"']:
                m = re.search(pattern, html)
                if m:
                    public_id = m.group(1)
                    break

        if not profile_entity_id and public_id:
            # Use publicIdentifier as fallback entity ID
            profile_entity_id = public_id

        if not profile_entity_id:
            return {"success": False, "error": "LinkedIn Profil-ID nicht gefunden. Bitte li_at Cookie erneuern."}

        # Step 3: fetch profile posts via Voyager profileUpdatesV2
        profile_urn = f"urn:li:fsd_profile:{profile_entity_id}"
        feed_resp = requests.get(
            "https://www.linkedin.com/voyager/api/identity/profileUpdatesV2",
            params={
                "q": "memberShareFeed",
                "moduleKey": "member-share",
                "count": limit,
                "start": 0,
                "profileUrn": profile_urn,
            },
            cookies=all_cookies,
            headers=voyager_headers,
            timeout=15,
        )

        if not feed_resp.text.strip():
            return {"success": False, "error": f"LinkedIn API leere Antwort (profileUrn={profile_urn})."}

        try:
            feed_data = feed_resp.json()
        except Exception:
            return {"success": False, "error": f"LinkedIn API Antwort nicht lesbar (HTTP {feed_resp.status_code})."}

        # Extract elements from normalized JSON
        elements = (feed_data.get("data", {}).get("elements", [])
                    or feed_data.get("elements", []))
        if not elements:
            # Try included list — some endpoints nest content there
            elements = [e for e in feed_data.get("included", [])
                        if isinstance(e, dict) and e.get("commentary")]

        posts = []
        for el in elements[:limit]:
            text = ""
            comm = el.get("commentary", {})
            if isinstance(comm, dict):
                txt_obj = comm.get("text", {})
                text = txt_obj.get("text", "") if isinstance(txt_obj, dict) else str(txt_obj)
            elif isinstance(comm, str):
                text = comm
            if not text:
                text = (el.get("specificContent", {})
                          .get("com.linkedin.ugc.ShareContent", {})
                          .get("shareCommentaryV2", {})
                          .get("text", ""))
            posts.append({
                "id": el.get("urn", str(len(posts))),
                "text": text.strip() or "[Kein Text]",
                "created_at": str(el.get("created", {}).get("time", "") if isinstance(el.get("created"), dict) else ""),
            })
        return {"success": True, "posts": posts}

    def get_posts(self, credentials: dict, limit: int = 10) -> dict:
        try:
            li_at = credentials.get("li_at", "").strip()
            jsessionid = credentials.get("jsessionid", "").strip()
            if li_at:
                if not jsessionid:
                    return {"success": False, "error": "JSESSIONID fehlt. Bitte LinkedIn erneut verbinden und JSESSIONID aus F12 → Application → Cookies → .linkedin.com kopieren."}
                return self._get_posts_via_cookie(li_at, jsessionid, limit)
            # Password/email path via linkedin_api library
            api = self._get_api(credentials)
            me = api.get_user_profile()
            public_id = (me.get("miniProfile", {}).get("publicIdentifier", "")
                         or me.get("publicIdentifier", ""))
            if not public_id:
                return {"success": False, "error": "LinkedIn Profil nicht gefunden."}
            raw = api.get_profile_posts(public_id=public_id, post_count=limit)
            posts = []
            for p in raw:
                text = ""
                comm = p.get("commentary", {})
                if isinstance(comm, dict):
                    text = comm.get("text", {}).get("text", "") if isinstance(comm.get("text"), dict) else str(comm.get("text", ""))
                elif isinstance(comm, str):
                    text = comm
                if not text:
                    text = (p.get("specificContent", {})
                              .get("com.linkedin.ugc.ShareContent", {})
                              .get("shareCommentaryV2", {})
                              .get("text", ""))
                posts.append({
                    "id": p.get("urn", str(len(posts))),
                    "text": text.strip() or "[Kein Text]",
                    "created_at": str(p.get("created", {}).get("time", "")),
                })
            return {"success": True, "posts": posts}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def post_content(self, credentials: dict, content: str) -> dict:
        try:
            api = self._get_api(credentials)
            human_delay(3.0, 12.0)
            # LinkedIn post через API
            profile = api.get_profile()
            urn = profile.get("entityUrn", "")
            api.post(content, urn=urn)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


class TwitterHandler:
    """Twitter/X — OAuth 2.0 PKCE (via Rust) oder OAuth 1.0a (Legacy)"""

    def _oauth2_request(self, method: str, url: str, token: str, body: dict = None):
        import urllib.request, urllib.parse, json as _j
        data = _j.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {token}")
        if body:
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=15) as r:
            return _j.loads(r.read())

    def connect(self, credentials: dict) -> dict:
        try:
            if credentials.get("oauth2_token"):
                data = self._oauth2_request("GET",
                    "https://api.twitter.com/2/users/me?user.fields=name,username",
                    credentials["oauth2_token"])
                user = data.get("data", {})
                return {"success": True, "profile": {"name": user.get("name", "Twitter User"), "username": user.get("username", "")}}
            # Legacy OAuth 1.0a
            if not all(credentials.get(k) for k in ["api_key", "api_secret", "access_token", "access_secret"]):
                return {"success": False, "error": "Bitte alle API-Felder ausfüllen"}
            return {"success": True, "profile": {"name": "Twitter User (OAuth 1.0a)", "username": ""}}
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
    
    def get_posts(self, credentials: dict, limit: int = 10) -> dict:
        # Twitter Free tier doesn't allow reading tweets via API
        return {"success": False, "error": "Twitter Free Tier erlaubt kein Lesen von Tweets. Bitte LinkedIn oder Instagram als Quelle verwenden."}

    def post_content(self, credentials: dict, content: str) -> dict:
        try:
            text = content[:277] + "..." if len(content) > 280 else content
            human_delay(2.0, 6.0)
            if credentials.get("oauth2_token"):
                result = self._oauth2_request("POST",
                    "https://api.twitter.com/2/tweets",
                    credentials["oauth2_token"],
                    {"text": text})
                if "errors" in result:
                    return {"success": False, "error": result["errors"][0].get("message", "Twitter API Fehler")}
                return {"success": True, "post_id": result.get("data", {}).get("id", "")}
            # Legacy OAuth 1.0a via Tweepy
            import tweepy
            client = tweepy.Client(
                consumer_key=credentials["api_key"],
                consumer_secret=credentials["api_secret"],
                access_token=credentials["access_token"],
                access_token_secret=credentials["access_secret"]
            )
            tweet = client.create_tweet(text=text)
            return {"success": True, "post_id": str(tweet.data["id"])}
        except Exception as e:
            err = str(e)
            if "403" in err or "Forbidden" in err:
                return {"success": False, "error": "Twitter API Fehler 403: Developer Portal prüfen — Project → App → Keys and Tokens."}
            return {"success": False, "error": err}


class TelegramHandler:
    """Telegram через Telethon"""

    def _session_path(self, phone: str) -> str:
        # Store sessions in AppData to avoid triggering Tauri file watcher
        d = pathlib.Path.home() / ".crosspost" / "sessions"
        d.mkdir(parents=True, exist_ok=True)
        safe = "".join(c for c in phone if c.isdigit() or c == "+")
        return str(d / f"telegram_{safe}")

    def connect(self, credentials: dict) -> dict:
        import glob
        session = self._session_path(credentials["phone"])
        session_file = session + ".session"

        if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
            return {"success": False, "error": "Telegram API-Zugangsdaten sind nicht konfiguriert. Bitte kontaktieren Sie den Support."}

        # Always delete old session to force fresh code request
        for f in glob.glob(session + "*"):
            try: os.remove(f)
            except: pass

        try:
            from telethon.sync import TelegramClient
            from telethon.errors import FloodWaitError, PhoneNumberBannedError, PhoneNumberInvalidError
            client = TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH)
            client.connect()
            try:
                sent = client.send_code_request(credentials["phone"])
            except FloodWaitError as e:
                client.disconnect()
                return {"success": False, "error": f"Zu viele Versuche. Telegram blockiert weitere Codes für {e.seconds} Sekunden ({e.seconds // 60} Minuten). Bitte warten."}
            except PhoneNumberInvalidError:
                client.disconnect()
                return {"success": False, "error": "Ungültige Telefonnummer. Bitte mit Ländervorwahl eingeben, z.B. +49 160 1234567"}
            except PhoneNumberBannedError:
                client.disconnect()
                return {"success": False, "error": "Diese Telefonnummer ist bei Telegram gesperrt."}
            client.disconnect()
            # Determine where the code was sent
            code_type = type(sent.type).__name__  # SentCodeTypeApp, SentCodeTypeSms, etc.
            return {
                "success": False,
                "error": "code_required",
                "phone": credentials["phone"],
                "phone_code_hash": sent.phone_code_hash,
                "code_type": code_type,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def verify_code(self, credentials: dict, code: str, phone_code_hash: str) -> dict:
        """Step 2: confirm OTP code and save session."""
        try:
            from telethon.sync import TelegramClient
            from telethon.errors import SessionPasswordNeededError
            session = self._session_path(credentials["phone"])
            client = TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH)
            client.connect()
            try:
                client.sign_in(credentials["phone"], code, phone_code_hash=phone_code_hash)
            except SessionPasswordNeededError:
                client.disconnect()
                return {"success": False, "error": "2fa_required"}
            me = client.get_me()
            client.disconnect()
            return {
                "success": True,
                "profile": {
                    "name": f"{me.first_name} {me.last_name or ''}".strip(),
                    "username": me.username or "",
                },
            }
        except Exception as e:
            err = str(e)
            if "2fa_required" in err:
                return {"success": False, "error": "2fa_required"}
            return {"success": False, "error": err}

    def verify_2fa(self, credentials: dict, password: str) -> dict:
        """Step 3: 2FA cloud password."""
        try:
            from telethon.sync import TelegramClient
            session = self._session_path(credentials["phone"])
            client = TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH)
            client.connect()
            client.sign_in(password=password)
            me = client.get_me()
            client.disconnect()
            return {
                "success": True,
                "profile": {
                    "name": f"{me.first_name} {me.last_name or ''}".strip(),
                    "username": me.username or "",
                },
            }
        except Exception as e:
            err = str(e)
            if "password" in err.lower() or "2fa" in err.lower() or "invalid" in err.lower():
                return {"success": False, "error": "Falsches Cloud-Passwort. Bitte erneut versuchen."}
            return {"success": False, "error": err}

    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            from telethon.sync import TelegramClient
            session = self._session_path(credentials["phone"])
            client = TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH)
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
            session = self._session_path(credentials["phone"])
            client = TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH)
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
        import imaplib
        import socket
        import ssl

        # Google OAuth path: use XOAUTH2 if google_oauth_token present
        if credentials.get("google_oauth_token"):
            return self._connect_google_oauth(credentials)

        email_addr = credentials["email"]
        password = credentials["password"]
        # Auto-detect IMAP server from email domain if not provided
        detected_imap, _smtp = _detect_email_servers(email_addr)
        host = credentials.get("imap_host") or detected_imap
        port = int(credentials.get("imap_port", 993))
        resolved_ip = credentials.get("imap_host_ip")

        try:
            ssl_context = ssl.create_default_context()

            if resolved_ip and hasattr(imaplib.IMAP4_SSL, "_create_socket"):
                # Python 3.9+: override _create_socket to connect to the pre-resolved IP
                # without touching DNS. SNI + cert verification still use the real hostname.
                _ip, _port, _host, _ctx = resolved_ip, port, host, ssl_context

                class _DirectIMAP4SSL(imaplib.IMAP4_SSL):
                    def _create_socket(self, timeout):
                        raw = socket.create_connection((_ip, _port), timeout or 30)
                        return _ctx.wrap_socket(raw, server_hostname=_host)

                imap = _DirectIMAP4SSL(host, port, ssl_context=ssl_context)
            else:
                # Fallback: plain IMAP4_SSL (uses system DNS)
                imap = imaplib.IMAP4_SSL(host, port, ssl_context=ssl_context)

            imap.login(email_addr, password)
            imap.logout()
            return {
                "success": True,
                "profile": {"name": email_addr, "username": email_addr}
            }
        except imaplib.IMAP4.error as e:
            err = str(e)
            if "AUTHENTICATIONFAILED" in err or "Invalid credentials" in err:
                hint = ""
                if "gmail" in host.lower():
                    hint = " → Bei Gmail: App-Passwort verwenden (Google-Konto → Sicherheit → App-Passwörter)"
                return {"success": False, "error": f"Falsches Passwort oder Benutzername.{hint}"}
            return {"success": False, "error": f"IMAP-Fehler: {err}"}
        except OSError as e:
            return {"success": False, "error": f"Netzwerkfehler: {e}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _connect_google_oauth(self, credentials: dict) -> dict:
        """Connect via IMAP XOAUTH2 using Google OAuth token."""
        import imaplib, base64
        email_addr = credentials.get("email", "")
        token = credentials["google_oauth_token"]
        auth_string = f"user={email_addr}\x01auth=Bearer {token}\x01\x01"
        auth_b64 = base64.b64encode(auth_string.encode()).decode()
        try:
            imap = imaplib.IMAP4_SSL("imap.gmail.com", 993)
            imap.authenticate("XOAUTH2", lambda x: auth_b64)
            imap.logout()
            return {"success": True, "profile": {"name": email_addr, "username": email_addr}}
        except Exception as e:
            return {"success": False, "error": f"Gmail OAuth IMAP: {e}"}

    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            import imaplib
            import email
            from email.header import decode_header
            detected_imap, _ = _detect_email_servers(credentials.get("email", ""))
            imap_host = credentials.get("imap_host") or detected_imap
            imap = imaplib.IMAP4_SSL(imap_host, int(credentials.get("imap_port", 993)))
            # Use XOAUTH2 if Google token present, else password login
            if credentials.get("google_oauth_token"):
                import base64
                email_addr = credentials.get("email", "")
                token = credentials["google_oauth_token"]
                auth_string = f"user={email_addr}\x01auth=Bearer {token}\x01\x01"
                auth_b64 = base64.b64encode(auth_string.encode()).decode()
                imap.authenticate("XOAUTH2", lambda x: auth_b64)
            else:
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
            
            _, detected_smtp = _detect_email_servers(credentials["email"])
            smtp_host = credentials.get("smtp_host") or detected_smtp
            with smtplib.SMTP_SSL(smtp_host, int(credentials.get("smtp_port", 465))) as server:
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

class WhatsAppHandler:
    def connect(self, params: dict) -> dict:
        return {"ok": False, "error": "WhatsApp-Integration ist noch in Entwicklung. Bald verfügbar!"}
    def post(self, params: dict) -> dict:
        return {"ok": False, "error": "WhatsApp noch nicht verfügbar."}
    def fetch_messages(self, params: dict) -> dict:
        return {"ok": False, "error": "WhatsApp noch nicht verfügbar."}


class InstagramGraphHandler:
    """Instagram + Facebook via official Meta Graph API (OAuth token).
    Used when credentials contain 'access_token' (set by Meta OAuth flow).
    """

    GRAPH = "https://graph.facebook.com/v19.0"

    def _get(self, path: str, token: str, params: dict = None) -> dict:
        import urllib.request, urllib.parse
        p = {"access_token": token}
        if params:
            p.update(params)
        url = f"{self.GRAPH}/{path}?{urllib.parse.urlencode(p)}"
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read())

    def _post_form(self, path: str, token: str, data: dict) -> dict:
        import urllib.request, urllib.parse
        data["access_token"] = token
        encoded = urllib.parse.urlencode(data).encode()
        req = urllib.request.Request(f"{self.GRAPH}/{path}", data=encoded, method="POST")
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())

    def connect(self, credentials: dict) -> dict:
        try:
            token = credentials.get("access_token", "")
            data = self._get("me", token, {"fields": "id,name"})
            if "error" in data:
                return {"success": False, "error": data["error"].get("message", "API Fehler")}
            return {"success": True, "profile": {"name": data.get("name", ""), "id": data.get("id", "")}}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_messages(self, credentials: dict, limit: int = 20) -> dict:
        try:
            token = credentials.get("access_token", "")
            platform = credentials.get("platform", "instagram")
            messages = []
            if platform == "instagram":
                user_id = credentials.get("user_id", "")
                data = self._get(f"{user_id}/conversations", token, {
                    "platform": "instagram",
                    "fields": "participants,messages{message,from,created_time}"
                })
                for conv in data.get("data", [])[:limit]:
                    for msg in conv.get("messages", {}).get("data", []):
                        sender = msg.get("from", {})
                        messages.append({
                            "id": msg.get("id", ""),
                            "conversation_id": conv.get("id", ""),
                            "sender_name": sender.get("name", ""),
                            "sender_id": sender.get("id", ""),
                            "content": msg.get("message", ""),
                            "direction": "incoming",
                            "created_at": msg.get("created_time", "")
                        })
            else:
                data = self._get("me/conversations", token, {
                    "fields": "participants,messages{message,from,created_time}"
                })
                for conv in data.get("data", [])[:limit]:
                    for msg in conv.get("messages", {}).get("data", []):
                        sender = msg.get("from", {})
                        messages.append({
                            "id": msg.get("id", ""),
                            "conversation_id": conv.get("id", ""),
                            "sender_name": sender.get("name", ""),
                            "sender_id": sender.get("id", ""),
                            "content": msg.get("message", ""),
                            "direction": "incoming",
                            "created_at": msg.get("created_time", "")
                        })
            return {"success": True, "messages": messages}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def send_message(self, credentials: dict, user_id: str, text: str) -> dict:
        try:
            token = credentials.get("access_token", "")
            ig_user_id = credentials.get("user_id", "")
            human_delay()
            typing_delay(text)
            result = self._post_form(f"{ig_user_id}/messages", token, {
                "recipient": json.dumps({"id": user_id}),
                "message": json.dumps({"text": text})
            })
            if "error" in result:
                return {"success": False, "error": result["error"].get("message", "Fehler")}
            return {"success": True, "message_id": result.get("message_id", "")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def post_content(self, credentials: dict, content: str, media_path: str = None) -> dict:
        try:
            token = credentials.get("access_token", "")
            platform = credentials.get("platform", "instagram")
            human_delay(3.0, 10.0)
            if platform == "instagram":
                ig_user_id = credentials.get("user_id", "")
                if not media_path:
                    return {"success": False, "error": "Instagram erfordert ein Bild oder Video für Posts"}
                container = self._post_form(f"{ig_user_id}/media", token, {
                    "image_url": media_path, "caption": content
                })
                container_id = container.get("id")
                if not container_id:
                    return {"success": False, "error": "Media-Container konnte nicht erstellt werden"}
                result = self._post_form(f"{ig_user_id}/media_publish", token, {"creation_id": container_id})
                return {"success": True, "post_id": result.get("id", "")}
            else:
                result = self._post_form("me/feed", token, {"message": content})
                if "error" in result:
                    return {"success": False, "error": result["error"].get("message", "Fehler")}
                return {"success": True, "post_id": result.get("id", "")}
        except Exception as e:
            return {"success": False, "error": str(e)}


_ig_legacy = InstagramHandler()
_ig_graph  = InstagramGraphHandler()


def _ig_handler(creds: dict):
    """Route to Graph API handler if OAuth token present, else legacy instagrapi."""
    return _ig_graph if creds.get("access_token") else _ig_legacy


handlers = {
    "instagram": _ig_legacy,   # replaced per-call in handle_command
    "facebook": _ig_legacy,    # replaced per-call in handle_command
    "whatsapp": WhatsAppHandler(),
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
        # Instagram/Facebook: route to Graph API handler if OAuth token is present
        if platform in ("instagram", "facebook"):
            creds = params.get("credentials", {})
            handler = _ig_handler(creds)
        else:
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
