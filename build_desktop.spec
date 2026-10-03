# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import collect_all

datas = [
    ('static', 'static'),
    ('.env', '.'),
]
binaries = []
hiddenimports = [
    'bcrypt',
    'itsdangerous',
    'google.auth',
    'google.oauth2.service_account',
    'pythonnet',
    'clr_loader',
    'cffi',
    'jinja2',
]

for pkg in ['fastapi', 'uvicorn', 'gspread', 'webview']:
    pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hiddenimports

a = Analysis(
    ['app_desktop.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['webview.platforms.android', 'webview.platforms.cocoa', 'webview.platforms.gtk', 'webview.platforms.qt'],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='KhoHangAnNam',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='static/favicon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='KhoHangAnNam',
)
