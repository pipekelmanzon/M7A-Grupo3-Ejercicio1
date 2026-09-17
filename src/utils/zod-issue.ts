interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

/** Formatea la ruta de un issue de Zod, o '(raiz)' si el issue no tiene ruta. */
export function zodIssuePath(issue: IssueLike): string {
  return issue.path.join('.') || '(raiz)';
}
