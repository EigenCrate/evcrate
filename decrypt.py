import sys
import base64
import json
import os
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Constants from the private-sharing logic
PBKDF2_ITER = 600_000
SALT_LEN = 16
IV_LEN = 12
TAG_LEN = 16  # Standard AES-GCM tag length used by Web Crypto API

def derive_key(password: str, salt: bytes) -> bytes:
    """Derive a 256-bit AES key using PBKDF2-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITER,
        backend=default_backend()
    )
    return kdf.derive(password.encode())

def decrypt(payload_b64: str, password: str):
    """Decrypt the payload with the given password."""
    # Decode from Base64
    payload = base64.b64decode(payload_b64)
    
    # Extract salt, IV, and ciphertext (which includes the tag)
    salt = payload[:SALT_LEN]
    iv = payload[SALT_LEN:SALT_LEN + IV_LEN]
    ciphertext_with_tag = payload[SALT_LEN + IV_LEN:]
    
    # Derive the key
    key = derive_key(password, salt)
    
    # Decrypt using AES-GCM
    aesgcm = AESGCM(key)
    try:
        # cryptography library handles the tag at the end of the ciphertext automatically
        plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, None)
    except Exception as e:
        raise ValueError("Decryption failed: wrong password or corrupted data.") from e
    
    # Find the null byte separator between metadata and file data
    try:
        sep_idx = plaintext.index(b'\x00')
    except ValueError:
        raise ValueError("Invalid payload: metadata separator (0x00) not found.")
    
    # Parse metadata
    meta_json = plaintext[:sep_idx].decode('utf-8')
    metadata = json.loads(meta_json)
    file_data = plaintext[sep_idx + 1:]
    
    return metadata, file_data

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 decrypt.py <input_path> <password> <output_path>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    password = sys.argv[2]
    output_path = sys.argv[3]
    
    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' not found.")
        sys.exit(1)
        
    try:
        with open(input_path, 'r') as f:
            payload_b64 = f.read().strip()
            
        metadata, file_data = decrypt(payload_b64, password)
        
        print(f"Successfully decrypted: {metadata.get('name', 'unknown')}")
        print(f"File Size: {metadata.get('size', 'unknown')} bytes")
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        
        with open(output_path, 'wb') as f:
            f.write(file_data)
            
        print(f"Decrypted data saved to: {output_path}")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
