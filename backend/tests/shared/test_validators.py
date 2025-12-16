"""
验证器测试
"""
import pytest
from src.shared.validators import (
    validate_ip_address,
    validate_mac_address,
    validate_port,
    validate_email,
    validate_hostname,
    validate_ip_network,
    validate_snmp_community,
    validate_required_fields,
    validate_string_length,
    validate_in_list,
    sanitize_string,
)


class TestIPAddressValidation:
    """IP地址验证测试"""

    def test_valid_ipv4(self):
        """测试有效的IPv4地址"""
        assert validate_ip_address("192.168.1.1") is True
        assert validate_ip_address("10.0.0.1") is True
        assert validate_ip_address("172.16.0.1") is True
        assert validate_ip_address("255.255.255.255") is True
        assert validate_ip_address("0.0.0.0") is True

    def test_invalid_ipv4(self):
        """测试无效的IPv4地址"""
        assert validate_ip_address("256.1.1.1") is False
        assert validate_ip_address("192.168.1") is False
        assert validate_ip_address("192.168.1.1.1") is False
        assert validate_ip_address("abc.def.ghi.jkl") is False
        assert validate_ip_address("") is False


class TestIPNetworkValidation:
    """IP网段验证测试"""

    def test_valid_cidr(self):
        """测试有效的CIDR格式"""
        assert validate_ip_network("192.168.1.0/24") is True
        assert validate_ip_network("10.0.0.0/8") is True
        assert validate_ip_network("172.16.0.0/16") is True

    def test_invalid_cidr(self):
        """测试无效的CIDR格式"""
        assert validate_ip_network("invalid") is False
        assert validate_ip_network("192.168.1.0/33") is False


class TestMACAddressValidation:
    """MAC地址验证测试"""

    def test_valid_mac_colon(self):
        """测试冒号分隔的MAC地址"""
        assert validate_mac_address("00:1A:2B:3C:4D:5E") is True
        assert validate_mac_address("aa:bb:cc:dd:ee:ff") is True

    def test_valid_mac_hyphen(self):
        """测试连字符分隔的MAC地址"""
        assert validate_mac_address("00-1A-2B-3C-4D-5E") is True

    def test_valid_mac_no_separator(self):
        """测试无分隔符的MAC地址"""
        assert validate_mac_address("001A2B3C4D5E") is True

    def test_invalid_mac(self):
        """测试无效的MAC地址"""
        assert validate_mac_address("00:1A:2B:3C:4D") is False
        assert validate_mac_address("GG:HH:II:JJ:KK:LL") is False
        assert validate_mac_address("") is False


class TestPortValidation:
    """端口验证测试"""

    def test_valid_ports(self):
        """测试有效端口"""
        assert validate_port(1) is True
        assert validate_port(80) is True
        assert validate_port(443) is True
        assert validate_port(8080) is True
        assert validate_port(65535) is True

    def test_invalid_ports(self):
        """测试无效端口"""
        assert validate_port(0) is False
        assert validate_port(-1) is False
        assert validate_port(65536) is False
        assert validate_port(100000) is False


class TestEmailValidation:
    """邮箱验证测试"""

    def test_valid_emails(self):
        """测试有效邮箱"""
        assert validate_email("test@example.com") is True
        assert validate_email("user.name@domain.org") is True

    def test_invalid_emails(self):
        """测试无效邮箱"""
        assert validate_email("invalid") is False
        assert validate_email("@example.com") is False
        assert validate_email("test@") is False
        assert validate_email("") is False


class TestHostnameValidation:
    """主机名验证测试"""

    def test_valid_hostnames(self):
        """测试有效主机名"""
        assert validate_hostname("server01") is True
        assert validate_hostname("web-server-01") is True
        assert validate_hostname("example.com") is True

    def test_invalid_hostnames(self):
        """测试无效主机名"""
        assert validate_hostname("-invalid") is False
        assert validate_hostname("") is False
        assert validate_hostname("a" * 300) is False  # 超长


class TestSNMPCommunityValidation:
    """SNMP Community验证测试"""

    def test_valid_community(self):
        """测试有效的Community字符串"""
        assert validate_snmp_community("public") is True
        assert validate_snmp_community("private") is True
        assert validate_snmp_community("my_community_123") is True

    def test_invalid_community(self):
        """测试无效的Community字符串"""
        assert validate_snmp_community("") is False
        assert validate_snmp_community("a" * 300) is False  # 超长


class TestRequiredFieldsValidation:
    """必填字段验证测试"""

    def test_all_fields_present(self):
        """测试所有字段都存在"""
        data = {"name": "test", "email": "test@example.com"}
        missing = validate_required_fields(data, ["name", "email"])
        assert missing == []

    def test_missing_fields(self):
        """测试缺失字段"""
        data = {"name": "test"}
        missing = validate_required_fields(data, ["name", "email"])
        assert "email" in missing

    def test_empty_string_field(self):
        """测试空字符串字段"""
        data = {"name": "", "email": "test@example.com"}
        missing = validate_required_fields(data, ["name", "email"])
        assert "name" in missing


class TestStringLengthValidation:
    """字符串长度验证测试"""

    def test_valid_length(self):
        """测试有效长度"""
        assert validate_string_length("hello", min_length=1, max_length=10) is True
        assert validate_string_length("", min_length=0, max_length=10) is True

    def test_invalid_length(self):
        """测试无效长度"""
        assert validate_string_length("hi", min_length=5, max_length=10) is False
        assert validate_string_length("hello world", min_length=1, max_length=5) is False


class TestInListValidation:
    """列表值验证测试"""

    def test_value_in_list(self):
        """测试值在列表中"""
        assert validate_in_list("active", ["active", "inactive"]) is True
        assert validate_in_list(1, [1, 2, 3]) is True

    def test_value_not_in_list(self):
        """测试值不在列表中"""
        assert validate_in_list("unknown", ["active", "inactive"]) is False


class TestSanitizeString:
    """字符串清理测试"""

    def test_trim_whitespace(self):
        """测试去除首尾空白"""
        assert sanitize_string("  hello  ") == "hello"

    def test_limit_length(self):
        """测试限制长度"""
        result = sanitize_string("hello world", max_length=5)
        assert result == "hello"

    def test_non_string_input(self):
        """测试非字符串输入"""
        assert sanitize_string(123) == ""
        assert sanitize_string(None) == ""
