import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { db, JWT_SECRET, sanitizeUser } from './database';
import { Role, User } from './types';

export interface AuthPayload {
  sub: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: 'Falta token de autenticación' });
  }

  const token = header.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload | string;
    if (typeof decoded === 'string' || !('sub' in decoded) || !('role' in decoded)) {
      return res.status(401).json({ message: 'Token inválido' });
    }

    const payload: AuthPayload = { sub: Number(decoded.sub), role: decoded.role as Role };
    const user = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(payload.sub) as
      | { id: number; name: string; email: string; role: Role; active: number }
      | undefined;
    if (!user || user.active !== 1) {
      return res.status(401).json({ message: 'Usuario inactivo o no encontrado' });
    }

    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

export function issueToken(payload: AuthPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function getCurrentUser(req: Request) {
  if (!req.user) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub) as User | undefined;
  if (!user) return null;
  return sanitizeUser(user);
}
