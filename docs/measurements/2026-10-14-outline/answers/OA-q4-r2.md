El cambio de tema se apoya en un store de MobX, un hook que construye el tema y un `ThemeProvider` de styled-components.

## 1. Estado: `app/stores/UiStore.ts`
- **`theme`** es la preferencia del usuario: `Theme.Light`, `Theme.Dark` o `Theme.System`. Por defecto es `System`.
- Se guarda en `Storage` bajo la clave `"theme"` (`THEME_STORAGE_KEY`). Se restaura al iniciar (línea ~172) y se escribe en `setTheme` (línea ~308).
- **`systemTheme`** refleja el tema del sistema operativo. El store se suscribe a `window.matchMedia("(prefers-color-scheme: dark)")` y actualiza el valor con cada cambio (líneas ~175-190). Si el navegador es antiguo, usa `addListener` en lugar de `addEventListener`.
- **`themeOverride`** se rellena cuando la URL trae `?theme=light|dark`. Dura toda la sesión, así que sobrevive a la navegación.
- **`resolvedTheme`** (línea ~540) es el getter computado que decide el tema efectivo. El orden de prioridad es:
  1. `themeOverride`.
  2. `systemTheme`, si `theme === "system"`.
  3. `theme`.

## 2. Construcción del tema: `app/hooks/useBuildTheme.ts`
El hook lee `ui.resolvedTheme` y devuelve un objeto de tema de `@shared/styles/theme`. Un `overrideTheme` opcional tiene prioridad sobre `ui.resolvedTheme`.
- **Impresión** (`print`): siempre `buildLightTheme`.
- **Móvil** (ancho ≤ `breakpoints.tablet`): `buildPitchBlackTheme` si es oscuro, `buildLightTheme` si es claro.
- **Escritorio**: `buildDarkTheme` o `buildLightTheme`.

Los tres constructores aceptan un tema personalizado del equipo (`TeamPreference.CustomTheme`). El hook descarta cualquier color que no sea hex válido (`validateColorHex`) antes de construir el tema. Todo va memoizado con `useMemo`. El hook también lee `?theme=` y llama a `ui.setThemeOverride`.

## 3. Aplicación: `app/components/Theme.tsx`
Este componente es un `observer` que:
- Llama a `useBuildTheme` con el tema personalizado del equipo, o con `auth.config.customTheme` si el equipo no tiene uno.
- Envuelve la app en `<ThemeProvider theme={theme}>` de styled-components e inyecta `GlobalStyles`. Los componentes leen los colores con `props.theme.*`.
- Emite un evento `window` `"theme-changed"` con `{ isDark }` cada vez que cambia `resolvedTheme`. También lo emite al cambiar la media query `print`. Las partes del editor que no usan styled-components, como los diagramas Mermaid, escuchan este evento para repintarse.

## 4. Disparadores en la interfaz: `app/actions/definitions/settings.tsx`
Hay acciones para tema oscuro, claro y sistema, que llaman a `stores.ui.setTheme(...)`. Hay otra que alterna entre claro y oscuro según `resolvedTheme`. Se pueden usar desde el menú de usuario o la barra de comandos. `app/scenes/Settings/Details.tsx` también usa el tema.

## Flujo resumido
Acción de UI → `ui.setTheme()` → cambia `theme` (observable) y se guarda en `Storage` → `resolvedTheme` se recalcula → `Theme.tsx` se vuelve a renderizar → `useBuildTheme` genera un tema nuevo → `ThemeProvider` repinta los componentes, y el evento `theme-changed` avisa al editor.
