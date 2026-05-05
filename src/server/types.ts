import 'fastify';
import type { PairAuth } from './db/repo.js';

declare module 'fastify' {
  interface FastifyRequest {
    pairAuth?: PairAuth;
  }
}
