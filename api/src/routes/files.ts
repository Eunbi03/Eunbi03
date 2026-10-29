import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';

// 자율 메시지 첨부파일 공개 다운로드 (문자/이메일 링크로 접근, 인증 불필요)
const router = Router();

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT filename, content_type, data FROM message_attachments WHERE id=$1', [req.params.id]
    );
    if (!rows[0]) { res.status(404).send('파일을 찾을 수 없거나 만료되었습니다.'); return; }
    const f = rows[0];
    res.setHeader('Content-Type', f.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.filename || 'file')}`);
    res.send(f.data);
  } catch {
    res.status(400).send('잘못된 요청입니다.');
  }
});

export default router;
