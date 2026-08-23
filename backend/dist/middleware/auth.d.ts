import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from '../types';
export interface AuthRequest extends Request {
    user?: JwtPayload;
}
export declare function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void;
