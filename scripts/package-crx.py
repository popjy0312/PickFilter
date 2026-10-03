#!/usr/bin/env python3
"""Build a genuine CRX3 with Chrome; keep the stable signing key outside the repo."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = ['manifest.json', 'background.js', 'core.js', 'content.js', 'open.js', 'README.md']


def fields(data):
    def varint(offset):
        value = shift = 0
        while offset < len(data) and shift < 70:
            byte = data[offset]
            offset += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value, offset
            shift += 7
        raise ValueError('Invalid protobuf varint')

    result = {}
    offset = 0
    while offset < len(data):
        tag, offset = varint(offset)
        if tag & 7 != 2:
            raise ValueError('Unexpected CRX header field type')
        size, offset = varint(offset)
        if offset + size > len(data):
            raise ValueError('Truncated CRX header')
        result.setdefault(tag >> 3, []).append(data[offset:offset + size])
        offset += size
    return result


def verify_crx(data, work):
    magic, version, size = struct.unpack('<4sII', data[:12])
    if magic != b'Cr24' or version != 3 or size > len(data) - 12:
        raise ValueError('Invalid CRX3 header')
    header = fields(data[12:12 + size])
    signed = header[10000][0]
    proof = fields(header[2][0])  # Chrome's generated RSA proof.
    public_key, signature = proof[1][0], proof[2][0]
    crx_id = fields(signed)[1][0]
    if crx_id != hashlib.sha256(public_key).digest()[:16]:
        raise ValueError('CRX identity does not match its public key')
    payload = data[12 + size:]
    (work / 'public.der').write_bytes(public_key)
    (work / 'signature').write_bytes(signature)
    (work / 'signed-data').write_bytes(b'CRX3 SignedData\x00' + struct.pack('<I', len(signed)) + signed + payload)
    subprocess.run(['openssl', 'pkey', '-pubin', '-inform', 'DER', '-in', str(work / 'public.der'),
                    '-out', str(work / 'public.pem')], check=True, capture_output=True)
    subprocess.run(['openssl', 'dgst', '-sha256', '-verify', str(work / 'public.pem'),
                    '-signature', str(work / 'signature'), str(work / 'signed-data')], check=True, capture_output=True)
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(FILES):
            raise ValueError('Unexpected extension package contents')
        manifest = json.loads(archive.read('manifest.json'))
        if any(key in manifest for key in ['host_permissions', 'content_scripts', 'optional_host_permissions']):
            raise ValueError('Package unexpectedly grants persistent site access')
    return ''.join(chr(ord('a') + int(digit, 16)) for digit in crx_id.hex())


def main():
    chrome = os.environ.get('CHROME_PATH') or shutil.which('google-chrome') or shutil.which('chromium')
    chrome = chrome or '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if not Path(chrome).is_file():
        raise SystemExit('Set CHROME_PATH to a Chrome/Chromium executable.')
    key = Path(os.environ.get('PICKFILTER_SIGNING_KEY', '~/.config/pickfilter/signing-key.pem')).expanduser().resolve()
    if key.is_relative_to(ROOT):
        raise SystemExit('The signing key must be stored outside the repository.')
    key.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    version = manifest['version']
    with tempfile.TemporaryDirectory(prefix='pickfilter-pack-') as tmp:
        work = Path(tmp)
        extension = work / 'extension'
        extension.mkdir()
        for name in FILES:
            shutil.copyfile(ROOT / name, extension / name)
        args = [chrome, '--headless=new', '--no-first-run', '--no-default-browser-check',
                '--no-message-box', '--user-data-dir=' + str(work / 'profile'),
                '--pack-extension=' + str(extension)]
        if key.exists():
            args.append('--pack-extension-key=' + str(key))
        subprocess.run(args, check=True, capture_output=True, timeout=60)
        data = (work / 'extension.crx').read_bytes()
        extension_id = verify_crx(data, work)
        if not key.exists():
            # Exclusive creation prevents accidentally replacing a stable identity.
            descriptor = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write((work / 'extension.pem').read_bytes())
        output = ROOT / 'dist'
        output.mkdir(exist_ok=True)
        pc_zip = output / f'PickFilter-v{version}.zip'
        with zipfile.ZipFile(pc_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in FILES:
                archive.write(ROOT / name, name)
        crx = output / f'PickFilter-v{version}.crx'
        crx.write_bytes(data)
        bundle = output / f'PickFilter-Android-CRX-v{version}.zip'
        with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.write(crx, crx.name)
            archive.write(ROOT / 'INSTALL-ANDROID.md', 'INSTALL-ANDROID.md')
        print(f'Verified CRX3 signature and package: {crx}')
        print(f'Extension ID: {extension_id}')
        print(f'SHA256: {hashlib.sha256(data).hexdigest()}')
        print(f'PC download bundle: {pc_zip}')
        print(f'Android download bundle: {bundle}')
        print(f'Keep the private signing key for updates: {key}')


if __name__ == '__main__':
    main()
