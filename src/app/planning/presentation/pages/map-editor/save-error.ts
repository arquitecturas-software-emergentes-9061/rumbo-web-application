import { HttpErrorResponse } from '@angular/common/http';
import { ServerIssue, fromServerIssues } from '../../../domain/model/graph-validation';
import { SaveFailure } from '../../../application/map-editor.contracts';

export function classifySaveError(error: HttpErrorResponse): SaveFailure {
  const code: string | undefined = error.error?.code;
  const issues = fromServerIssues(error.error?.issues as ServerIssue[] | undefined);
  if (error.status === 412 || code === 'STALE_DRAFT_GRAPH') {
    return { kind: 'stale', issues, message: 'Otra persona modificó el borrador mientras lo editabas. Recarga la última versión; tus cambios locales no se guardaron.' };
  }
  if (error.status === 409) {
    return { kind: 'not-draft', issues, message: 'Este mapa ya no es un borrador (por ejemplo, ya se publicó). Recarga para ver el estado actual.' };
  }
  if (error.status === 422) {
    return { kind: 'invalid', issues, message: issues.length > 0 ? `El servidor rechazó el borrador por ${issues.length} problema${issues.length === 1 ? '' : 's'}. Revisa la pestaña Alertas.` : 'El servidor rechazó el borrador. Revisa los elementos del mapa.' };
  }
  if (error.status === 0) {
    return { kind: 'offline', issues, message: 'No hay conexión con la API. Tus cambios siguen en el editor; vuelve a intentar guardar.' };
  }
  if (error.status === 403) return { kind: 'forbidden', issues, message: 'Tu cuenta no tiene permiso para editar este mapa.' };
  if (error.status === 404) return { kind: 'missing', issues, message: 'El borrador ya no existe para esta sede.' };
  return { kind: 'other', issues, message: 'No se pudo guardar el borrador. Intenta de nuevo.' };
}
