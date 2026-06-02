import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

function rawBodyPlugin(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request: FastifyRequest, body: Buffer, parseDone) => {
      if (request.routeOptions.config?.rawBody) {
        request.rawBody = body;
      }
      try {
        const json = JSON.parse(body.toString()) as unknown;
        parseDone(null, json);
      } catch (err) {
        parseDone(err as Error, undefined);
      }
    },
  );
  done();
}

export default fp(rawBodyPlugin, {
  name: 'raw-body-plugin',
});
