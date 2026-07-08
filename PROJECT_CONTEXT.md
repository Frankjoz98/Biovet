# 🧬 BioVet OS - Contexto del Proyecto y Registro de Progreso

> **Para futuros asistentes de IA:** Lee detenidamente este documento antes de realizar cambios estructurales en el sistema. Contiene reglas de negocio clave, arquitectura y decisiones de diseño previas.

---

## 🛠 Tech Stack y Dependencias

- **Framework:** React 19 + Vite.
- **Lenguaje:** TypeScript (Estricto, se requiere tipado fuerte para despliegues en Netlify).
- **Estilos:** TailwindCSS (v3.4) usando clases utilitarias para lograr un diseño oscuro y "Glassmorphism" (ej. `.glass-panel`, `.text-shadow-neon`).
- **Iconos:** `lucide-react` (v1.22).
- **Backend / Base de Datos:** Supabase (PostgreSQL).

### Configuración del Despliegue
- El proyecto se hospeda en **Netlify**.
- **Comando de Build:** `tsc -b && vite build`.
- **Regla crítica:** Cualquier variable declarada y no utilizada (`TS6133`), errores de sintaxis JSX no cerrados, o falta de tipado generarán que el build en Netlify falle. Siempre verifica con `npm run build` localmente o usando un validador antes de realizar commits.

---

## 🧩 Estructura de Módulos (Frontend)

Todos los módulos principales viven en `src/modules/` y se renderizan dinámicamente desde `App.tsx`.

1. **`Caja.tsx` (POS y Facturación)**
   - El corazón del sistema. Permite agregar productos al carrito y facturar.
   - Soporta modalidades de pago: Efectivo, Crédito y Transferencia.
   - Tiene dos pestañas ("Tienda" y "Ruta") que alteran el comportamiento del flujo.
   - Maneja la emisión de recibos optimizados para **impresoras térmicas de 80mm**.

2. **`Inventario.tsx`**
   - CRUD del catálogo de productos.
   - Controla alertas visuales de inventario (Stock mínimo).

3. **`Clientes.tsx`**
   - Administración del directorio.
   - Control de métricas crediticias: `credit_limit` y `current_debt`.

4. **`Rutas.tsx`**
   - Gestión de zonas geográficas o vendedores.
   - Un vendedor de ruta (`bv_collaborators`) tiene un ID que se asocia a las ventas que realiza en su jornada.

5. **`Reportes.tsx`**
   - Dashboard analítico con resumen P&L (Pérdidas y Ganancias).
   - Discrimina entre Ventas Locales y Ventas de Ruta.
   - Contabiliza los "Gastos Operativos" (provenientes de Caja) para deducirlos del ingreso neto.

---

## 🏗 Reglas de Negocio y Base de Datos (Supabase)

### 1. Ventas: Tienda vs Ruta
La tabla `bv_sales` contiene una columna clave `sale_type` (`store` o `route`).
- Las ventas de `store` se asocian a un **Turno de Caja** (`bv_cash_sessions`).
- Las ventas de `route` se asocian a un **Cierre de Jornada de Ruta** (`bv_route_closings`).

### 2. Comisiones Dinámicas (Rutas)
A diferencia de un salario fijo, los vendedores ganan un porcentaje dependiendo de la *categoría* del producto vendido (ej. Alimento de gatos = 3%, Accesorios = 5%).
- Esto se define en la tabla `bv_category_commissions`.
- **Cierre Atómico:** Cuando un vendedor termina su ruta, se llama al procedimiento almacenado (RPC) `bv_close_route(p_route_closing_id)`. Este RPC calcula del lado del servidor el total vendido por categoría y asigna las comisiones de manera 100% segura.

### 3. Manejo de Stock (Condiciones de Carrera)
**Regla crítica:** ¡NUNCA restar inventario desde el Frontend (React)!
Si dos personas facturan el mismo producto simultáneamente leyendo el array del carrito, podrían corromper el inventario.
- **Solución:** Se diseñó el procedimiento almacenado `bv_decrement_stock(p_product_id, p_quantity)` en Supabase. Cada venta iterada en el frontend manda a llamar este RPC para restar el stock atómicamente a nivel de la base de datos PostgreSQL.

### 4. Notificaciones UI (Toasts)
No se deben usar alertas nativas (`alert()`) por motivos estéticos.
Se creó un helper en `src/lib/toast.ts` que emite un evento personalizado (`biovet-toast`).
- **Uso:** `import { toast } from '../lib/toast';` -> `toast.success('Mensaje')` o `toast.error('Error')`.

---

## 🔮 Futuro Desarrollo (Backlog)

Para las siguientes conversaciones o sprints, estos son los problemas pendientes a resolver:

1. **Gestión de Devoluciones / Notas de Crédito**
   - Revertir una venta requiere: sumar inventario devuelto, descontar dinero del flujo de caja, y si fue en ruta, *restar* la comisión generada al vendedor.
2. **Abonos y Cuentas por Cobrar**
   - Actualmente un cliente acumula `current_debt`. Se necesita un módulo/modal para registrar "Abonos", donde un cliente paga parte de su deuda.
3. **Paginación / Virtualización**
   - Si la tabla `bv_sales` supera los miles de registros, la carga frontal del Reporte o la Caja podría saturarse. Implementar paginación con `range()` en Supabase.
4. **Configuración de Empresa (Recibos)**
   - Sustituir la data quemada (hardcoded) del nombre de la clínica veterinaria en el recibo por datos dinámicos provenientes de una tabla `bv_settings`.

---
*Documento actualizado tras completar el Sprint de Rutas, Comisiones y UI de Caja (Julio 2026).*
