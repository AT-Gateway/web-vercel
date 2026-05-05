import 'fastify';
import type { PairAuth } from './db/repo';

declare module 'fastify' {
  interface FastifyRequest {
    pairAuth?: PairAuth;
  }
}
