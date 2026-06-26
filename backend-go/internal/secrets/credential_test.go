package secrets

import "testing"

const testMaster = "unit-test-master-key-0123456789"

func TestCipherRoundTrip(t *testing.T) {
	c, err := NewCipher(testMaster)
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	plain := "Huawei@123"
	enc, err := c.Encrypt(plain)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if !IsEncrypted(enc) {
		t.Fatalf("expected enc:v1: prefix, got %q", enc)
	}
	if enc == plain {
		t.Fatal("ciphertext must differ from plaintext")
	}
	dec, err := c.Decrypt(enc)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if dec != plain {
		t.Fatalf("round-trip mismatch: got %q want %q", dec, plain)
	}
}

func TestDecryptPlaintextPassthrough(t *testing.T) {
	c, _ := NewCipher(testMaster)
	// 存量明文（无前缀）必须原样返回，保证平滑兼容。
	out, err := c.Decrypt("legacy-plaintext-pw")
	if err != nil {
		t.Fatalf("Decrypt plaintext: %v", err)
	}
	if out != "legacy-plaintext-pw" {
		t.Fatalf("expected passthrough, got %q", out)
	}
}

func TestEncryptEmptyAndIdempotent(t *testing.T) {
	c, _ := NewCipher(testMaster)
	if out, _ := c.Encrypt(""); out != "" {
		t.Fatalf("empty string must stay empty, got %q", out)
	}
	enc, _ := c.Encrypt("secret")
	again, _ := c.Encrypt(enc)
	if again != enc {
		t.Fatal("re-encrypting ciphertext must be a no-op (idempotent)")
	}
}

func TestDecryptWrongKeyFails(t *testing.T) {
	c1, _ := NewCipher("key-one-aaaaaaaaaaaaaaaa")
	c2, _ := NewCipher("key-two-bbbbbbbbbbbbbbbb")
	enc, _ := c1.Encrypt("secret")
	if _, err := c2.Decrypt(enc); err == nil {
		t.Fatal("expected decrypt failure with wrong key (GCM auth)")
	}
}

func TestNilCipherPassthrough(t *testing.T) {
	var c *Cipher // 未配置密钥时退化为明文直通
	if out, _ := c.Encrypt("x"); out != "x" {
		t.Fatal("nil Encrypt must passthrough")
	}
	if out, _ := c.Decrypt("x"); out != "x" {
		t.Fatal("nil Decrypt must passthrough")
	}
}

func TestEmptyMasterRejected(t *testing.T) {
	if _, err := NewCipher("   "); err == nil {
		t.Fatal("expected error for empty master key")
	}
}
