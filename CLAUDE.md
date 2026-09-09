# Cómo se trabaja en este repositorio

## Publicar es parte del trabajo, no un paso aparte

**Todo va a `main` automáticamente, sin preguntar.** Lo pidió el dueño del
repositorio con esas palabras: «pon todo siempre en Main automáticamente».

El ciclo completo de cualquier cambio es:

```
rama de trabajo → comprobaciones → commit → main → push → comprobar en vivo
```

Concretamente, y en este orden:

1. Desarrollar en la rama de trabajo, como siempre.
2. `node herramientas/revisar.mjs` y `node herramientas/revisar-seo.mjs`. Si algo
   falla, se arregla antes de seguir. No se publica en rojo.
3. Commit en la rama, y `git push -u origin <rama>`.
4. `git checkout main && git merge --ff-only <rama> && git push origin main`.
5. Comprobar que está publicado de verdad (ver más abajo).

No hay que pedir permiso en cada paso: el permiso está dado aquí. Lo que sí hay
que hacer es **decir qué se publicó**, porque quien lo lee necesita saber qué
acaba de cambiar para los estudiantes.

### Lo que eso significa, dicho una vez

`main` es lo que sirve GitHub Pages. Un push a `main` no es guardar el trabajo:
es publicarlo en escuelacem.com, para los estudiantes y para quien llegue desde
Google. Por eso el paso 2 no es opcional y por eso se comprueba en vivo después.

## Comprobar que algo está publicado

**No se mira Actions.** La API de GitHub deja ejecuciones de
`pages build and deployment` marcadas como `queued` durante horas aunque el
despliegue ya haya ocurrido — está documentado en `docs/lo-que-falta.md` §1.0,
con la falsa alarma que lo demostró.

La forma fiable es pedir el archivo y comparar:

```
curl -sS https://escuelacem.com/<lo que sea> | grep <lo que debería decir>
```

Suele tardar uno o dos minutos desde el push.

## Los archivos generados no se editan a mano

Los escribe `node herramientas/generar-seo.mjs` desde el catálogo publicado:

```
/index.html   /contacto.html   /preguntas-frecuentes.html   /404.html
/programas/   /sitemap.xml     /robots.txt
```

Una tarea automática los regenera cada día, así que **un cambio a mano dura
hasta mañana**. Lo que hay que tocar es la plantilla, dentro de `generar-seo.mjs`.

Y cuando esos archivos den conflicto al fusionar —pasa, porque la tarea diaria
los reescribe—, el conflicto no se resuelve a mano: se resuelve volviendo a
generarlos.

```
git checkout --ours -- <los que chocaron>
node herramientas/generar-seo.mjs
```

## El repositorio es público

Nada secreto entra aquí: ni claves de API, ni contraseñas, ni el correo de
nadie. Las claves de prueba salen de la variable `CEM_PASS` y no se escriben en
ningún archivo. La clave publicable de Supabase sí puede estar en el código —es
pública por diseño, y lo que protege los datos son las funciones del servidor,
no esconderla.

## Cómo está montada la seguridad de la base

El patrón de la casa, y conviene seguirlo en lo nuevo: **RLS encendida, cero
políticas, y todo el acceso por funciones `SECURITY DEFINER`**, con

```sql
revoke all on function ... from public, anon;
grant execute on function ... to authenticated;
```

Una función que reciba «de quién son los datos» como parámetro está mal: se
atiene a `auth.uid()` y comprueba ella misma de quién es lo que devuelve.
