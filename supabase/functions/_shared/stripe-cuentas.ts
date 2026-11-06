// CEM · En qué cuenta de Stripe se cobra cada programa.
//
// Hay una cuenta principal, la del CEM: la fila `stripe` de cem_integraciones,
// la de siempre. Y puede haber otras, de otras empresas que son las
// beneficiarias de algunos programas: filas `stripe:<clave>`, que se configuran
// en Admin → Cobros con tarjeta → Otras empresas.
//
// Cada programa dice en cuál cobra (cem_courses.stripe_cuenta; vacío = la del
// CEM). Lo leen las tres funciones que hablan con Stripe —abrir el cobro de una
// cuota, abrir la compra sin cuenta, y recibir el aviso de pago— para que las
// tres usen SIEMPRE la misma cuenta para el mismo programa. Si una cobrara en
// una cuenta y el aviso se comprobara con el secreto de otra, el pago se
// quedaría sin asentar y el curso cerrado.
//
// Y lo cobrado en cada cuenta se apunta con su propio método —«Tarjeta de
// crédito/débito (Empresa)»—, que lleva a su propia cartera: el dinero de otra
// empresa no se mezcla con el del CEM.

// deno-lint-ignore no-explicit-any
type Admin = any;

/** El método con el que se apunta lo cobrado en la cuenta principal. */
export const METODO_PRINCIPAL = 'Tarjeta de crédito/débito';

export type CuentaStripe = {
  /** null = la cuenta principal del CEM. */
  clave: string | null;
  nombre: string;
  secret_key: string | null;
  webhook_secret: string | null;
  /** Con qué método se registran sus cobros (y por él, en qué cartera). */
  metodo: string | null;
};

/** La clave de una cuenta, como la guarda la base: minúsculas, letras,
 *  números y guiones. Lo que no tenga esa forma no es una cuenta, y se trata
 *  como tal en vez de buscarlo: `?cuenta=` lo escribe quien llama. */
export function claveValida(clave: unknown): string | null | false {
  const c = String(clave ?? '').trim().toLowerCase();
  if (!c) return null;
  return /^[a-z0-9][a-z0-9-]{1,29}$/.test(c) ? c : false;
}

/** Una cuenta por su clave (null o vacío = la principal). Devuelve null si
 *  no existe. */
export async function cuentaPorClave(admin: Admin, clave: unknown): Promise<CuentaStripe | null> {
  const c = claveValida(clave);
  if (c === false) return null;
  const { data } = await admin.from('cem_integraciones')
    .select('datos').eq('id', c ? `stripe:${c}` : 'stripe').maybeSingle();
  if (!data) return null;
  const d = (data.datos ?? {}) as Record<string, string | undefined>;
  return {
    clave: c,
    nombre: c ? (d.nombre || c) : 'CEM',
    secret_key: d.secret_key || null,
    webhook_secret: d.webhook_secret || null,
    // El de una cuenta de otra empresa lo puso la base al configurarla, con
    // su cartera detrás. No se inventa aquí: un método que no existe en
    // cem_metodos_pago haría fallar el registro del pago.
    metodo: c ? (d.metodo || null) : METODO_PRINCIPAL,
  };
}

/** El producto del curso en Stripe, sólo si consta que ya existe en SU
 *  cuenta: ni pendiente de crearse (`stripe_sync_peticion`) ni con un error
 *  al reflejarlo. Al pasar un programa a la cuenta de otra empresa, el
 *  producto se crea de nuevo allí, y durante ese minuto —o si falla— cobrar
 *  contra él daría «No such product». Entonces se cobra con el nombre del
 *  programa, como antes de que existieran los productos: un cobro no se
 *  pierde por un adorno de catálogo. */
export function productoListo(curso: Record<string, unknown> | null | undefined): string | null {
  if (!curso?.stripe_product_id) return null;
  if (curso.stripe_sync_peticion != null || curso.stripe_sync_error) return null;
  return String(curso.stripe_product_id);
}

/** Las columnas del curso que hacen falta para cobrarlo. */
export const COLUMNAS_COBRO = 'stripe_cuenta, stripe_product_id, stripe_sync_peticion, stripe_sync_error';

/** La cuenta en la que se cobra un programa y el producto contra el que se
 *  cobra. `cuenta` es null si no existe la cuenta a la que apunta;
 *  `deOtraEmpresa` dice si apunta a una que no es la del CEM. */
export async function cuentaDelCurso(admin: Admin, courseId: string):
    Promise<{ cuenta: CuentaStripe | null; producto: string | null; deOtraEmpresa: boolean }> {
  const { data: curso } = await admin.from('cem_courses')
    .select(COLUMNAS_COBRO).eq('id', courseId).maybeSingle();
  return {
    cuenta: await cuentaPorClave(admin, curso?.stripe_cuenta ?? null),
    producto: productoListo(curso),
    deOtraEmpresa: !!curso?.stripe_cuenta,
  };
}

/** Todas las cuentas configuradas, la principal primero. Para el aviso de
 *  pago que llega sin `?cuenta=`: se busca la cuenta cuyo secreto firma el
 *  aviso. */
export async function todasLasCuentas(admin: Admin): Promise<CuentaStripe[]> {
  const { data } = await admin.from('cem_integraciones').select('id').like('id', 'stripe%');
  const ids = ((data ?? []) as { id: string }[]).map((f) => f.id)
    .filter((id) => id === 'stripe' || id.startsWith('stripe:'))
    .sort((a, b) => (a === 'stripe' ? -1 : b === 'stripe' ? 1 : a.localeCompare(b)));
  const cuentas = await Promise.all(ids.map((id) => cuentaPorClave(admin, id === 'stripe' ? null : id.slice(7))));
  return cuentas.filter((c): c is CuentaStripe => c !== null);
}
