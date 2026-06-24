# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # LinkedIn
        'linkedin_api', 'linkedin_api.clients',
        'bs4', 'lxml', 'lxml.etree',
        # Instagram / Facebook
        'instagrapi', 'instagrapi.mixins',
        # Twitter
        'tweepy', 'tweepy.asynchronous',
        # Telegram
        'telethon', 'telethon.sessions', 'telethon.crypto',
        # AI
        'anthropic', 'openai',
        'google.generativeai', 'google.auth',
        # Utilities
        'PIL', 'PIL.Image', 'requests', 'dotenv',
        'cryptography', 'cryptography.hazmat.primitives',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
