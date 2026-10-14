Esto es lo que encontré en el código.

## Resumen

El tema se resuelve en un store de MobX, se convierte en un objeto de tema de styled-components con un hook, y un componente `Theme` lo inyecta en toda la app.

## 1. Estado: `app/stores/UiStore.ts`
- `theme` es la preferencia del usuario (`Theme.System` por defecto, o `light` o `dark`). Se guarda en `Storage` bajo la clave `"theme"` (líneas 19, 172-173 y 308-313, `setTheme`).
- `systemTheme` guarda el tema del sistema operativo. Se actualiza con un listener de `matchMedia("(prefers-color-scheme: dark)")`, que usa `addEventListener("change")` y recurre a `addListener` en navegadores antiguos (líneas 175-190).
- `themeOverride` se fija con `setThemeOverride` (línea 325). Dura toda la sesión y se activa cuando la URL trae `?theme=light|dark`.
- El getter `resolvedTheme` (línea 540) decide el tema efectivo, en este orden:
  1. `themeOverride`, si existe.
  2. `systemTheme`, si `theme === "system"`.
  3. `theme`, en cualquier otro caso.

## 2. Construcción del tema: `app/hooks/useBuildTheme.ts`
Este hook lee `ui.resolvedTheme` y llama a un constructor de `shared/styles/theme.ts`:
- **Impresión** (`print`): siempre `buildLightTheme`.
- **Móvil** (ancho ≤ breakpoint `tablet`): `buildPitchBlackTheme` si es oscuro, o `buildLightTheme` si es claro.
- **Escritorio**: `buildDarkTheme` o `buildLightTheme`.

También hace dos cosas más:
- Lee `?theme=` de la URL y se lo pasa a `ui.setThemeOverride`.
- Aplica el tema personalizado del equipo o de la configuración (`CustomTheme`). Descarta los colores que no sean hex válidos con `validateColorHex`, y el resultado se memoiza con `useMemo`.

## 3. Aplicación: `app/components/Theme.tsx`
- Es un componente `observer` que envuelve la app con `ThemeProvider` de styled-components, junto con `GlobalStyles`, `DirectionProvider` (RTL) y `StyleSheetProvider`.
- Cuando cambia `ui.resolvedTheme`, emite un `CustomEvent("theme-changed", { detail: { isDark } })` en `window`. Lo usan elementos del editor, como los diagramas Mermaid, que no se re-renderizan por React.
- Escucha el media query `print` y emite el mismo evento con `isDark: false` mientras se imprime.

## 4. Selector de UI
`app/scenes/Settings/Details.tsx` (y `Preferences`, si existe) llama a `ui.setTheme(...)`. La vista compartida, `app/scenes/Shared/index.tsx`, usa `useBuildTheme` con un `overrideTheme`.

Los componentes no usan colores fijos. Leen los tokens de `props.theme` (por ejemplo `theme.background` o `theme.text`), así que cambiar el objeto de tema re-estiliza todo.

Si quieres, puedo revisar cómo están definidos los tokens de color en `shared/styles/theme.ts`, o dónde está el selector de tema en Preferencias.
