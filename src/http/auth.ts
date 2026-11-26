import type { Request, Response, NextFunction, RequestHandler } from 'express'

export function bearerAuth(token: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? ''
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    if (provided !== token) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  }
}
