import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.ts';
import { FILTER_ORDER } from '../../pipeline/filter-registry.ts';
import { findBrokenDependencies } from '../../pipeline/pipeline-config.store.ts';
import { HttpError } from '../../utils/http-error.ts';
import { zodIssuePath } from '../../utils/zod-issue.ts';

export function getConfig(container: Container): RequestHandler {
  return (_request, response) => {
    response.status(200).json({
      data: {
        config: container.configStore.get(),
        filterOrder: [...FILTER_ORDER],
        registeredFilters: container.filters.map((filter) => filter.name),
      },
    });
  };
}

/**
 * Reemplaza la configuracion completa. Deshabilitar un filtro del que otro
 * depende es valido, asi que se acepta y se avisa por `warnings`.
 */
export function replaceConfig(container: Container): RequestHandler {
  return (request, response, next) => {
    let config;
    try {
      config = container.configStore.replace(request.body);
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        next(error);
        return;
      }
      next(new HttpError(400, 'Configuracion de pipeline invalida', {
        issues: error.issues.map((issue) => ({ path: zodIssuePath(issue), message: issue.message })),
      }));
      return;
    }

    response.status(200).json({
      data: { config, warnings: findBrokenDependencies(config) },
    });
  };
}
