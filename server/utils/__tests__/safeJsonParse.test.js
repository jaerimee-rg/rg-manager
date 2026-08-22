import { jest } from '@jest/globals';
import { safeJsonParse } from '../safeJsonParse.js';

describe('safeJsonParse', () => {
  // Normal inputs
  describe('유효한 JSON 문자열', () => {
    it('should parse valid JSON array', () => {
      const result = safeJsonParse('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse valid JSON object', () => {
      const result = safeJsonParse('{"name": "John", "age": 30}');
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should parse empty array', () => {
      const result = safeJsonParse('[]');
      expect(result).toEqual([]);
    });

    it('should parse empty object', () => {
      const result = safeJsonParse('{}');
      expect(result).toEqual({});
    });

    it('should parse nested objects', () => {
      const result = safeJsonParse('{"user": {"name": "Alice", "settings": {"theme": "dark"}}}');
      expect(result).toEqual({ user: { name: 'Alice', settings: { theme: 'dark' } } });
    });

    it('should parse JSON with special characters', () => {
      const result = safeJsonParse('{"message": "Hello\\nWorld\\t!"}');
      expect(result).toEqual({ message: 'Hello\nWorld\t!' });
    });
  });

  // Edge cases
  describe('엣지 케이스', () => {
    it('should return default value for null input', () => {
      const result = safeJsonParse(null);
      expect(result).toEqual([]);
    });

    it('should return default value for undefined input', () => {
      const result = safeJsonParse(undefined);
      expect(result).toEqual([]);
    });

    it('should return default value for empty string', () => {
      const result = safeJsonParse('');
      expect(result).toEqual([]);
    });

    it('should return custom default value for null input', () => {
      const result = safeJsonParse(null, { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should return custom default value for empty string', () => {
      const result = safeJsonParse('', 'fallback');
      expect(result).toEqual('fallback');
    });
  });

  // Error conditions
  describe('잘못된 JSON 문자열', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    afterEach(() => {
      consoleErrorSpy.mockClear();
    });

    afterAll(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should return default value for invalid JSON', () => {
      const result = safeJsonParse('{invalid json}');
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return default value for malformed JSON', () => {
      const result = safeJsonParse('{"name": }');
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return default value for incomplete JSON', () => {
      const result = safeJsonParse('[1, 2, 3');
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return custom default value for invalid JSON', () => {
      const result = safeJsonParse('invalid', null);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log error message with original string', () => {
      const invalidJson = '{bad: json}';
      safeJsonParse(invalidJson);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('JSON 파싱 오류:'),
        expect.any(String),
        expect.stringContaining('원본:'),
        invalidJson
      );
    });

    it('should handle non-string primitives gracefully', () => {
      expect(safeJsonParse(123)).toEqual([]);
      expect(safeJsonParse(true)).toEqual([]);
      expect(safeJsonParse(false)).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // Type preservation
  describe('타입 보존', () => {
    it('should preserve number types', () => {
      const result = safeJsonParse('[1, 2.5, -3, 0]');
      expect(result).toEqual([1, 2.5, -3, 0]);
    });

    it('should preserve boolean types', () => {
      const result = safeJsonParse('{"isActive": true, "isDeleted": false}');
      expect(result).toEqual({ isActive: true, isDeleted: false });
    });

    it('should preserve null values', () => {
      const result = safeJsonParse('{"value": null}');
      expect(result).toEqual({ value: null });
    });

    it('should preserve array of mixed types', () => {
      const result = safeJsonParse('[1, "two", true, null, {"key": "value"}]');
      expect(result).toEqual([1, 'two', true, null, { key: 'value' }]);
    });
  });
});
