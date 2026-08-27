import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const key = issue.path.join('.') || 'body';
          details[key] = details[key] ?? [];
          details[key].push(issue.message);
        }
        res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details });
        return;
      }
      next(err);
    }
  };
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
