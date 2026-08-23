import pool from '../database.js';
import LlmCallLog from '../models/LlmCallLog.js';

// 로그 조회
export const getLogs = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM logs ORDER BY "createdAt" DESC LIMIT 1000'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('로그 조회 실패:', error);
    res.status(500).json({ error: '로그 조회 실패' });
  }
};

const requireAdmin = (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '권한이 없습니다.' });
    return false;
  }
  return true;
};

/**
 * AI 호출 이력 목록 (관리자 전용).
 * 프롬프트 원문은 길어서 목록에는 담지 않는다 — 상세에서 읽는다.
 */
export const getLlmLogs = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const filter = {};
    if (req.query.userId && req.query.userId !== 'all') {
      const parsed = parseInt(req.query.userId, 10);
      if (isNaN(parsed)) return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
      filter.userId = parsed;
    }
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

    const [logs, total] = await Promise.all([
      LlmCallLog.list({ ...filter, limit, offset }),
      LlmCallLog.count(filter)
    ]);

    res.json({ logs, total });
  } catch (error) {
    console.error('AI 호출 이력 조회 실패:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 상세 (프롬프트 원문·응답 포함)
export const getLlmLogDetail = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });

    const log = await LlmCallLog.getById(id);
    if (!log) return res.status(404).json({ error: '이력을 찾을 수 없습니다.' });

    res.json(log);
  } catch (error) {
    console.error('AI 호출 이력 상세 조회 실패:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
