/* Acceso de bajo volumen a Supabase para Mi Cartera.
 * Configurar window.MI_CARTERA_SUPABASE antes de cargar este archivo:
 * { url: 'https://<project>.supabase.co', anonKey: '<publishable/anon key>' }
 * Requiere una sesión de Supabase Auth; nunca usar service_role en el navegador.
 */
(function (global) {
  const config = global.MI_CARTERA_SUPABASE;
  const api = {
    enabled: false,
    client: null,
    userId: null,
    async ensureClient() {
      if (this.client) return this.client;
      if (!config?.url || !config?.anonKey) throw new Error('Falta la URL o la clave pública de Supabase.');
      if (!global.supabase?.createClient) {
        await new Promise((resolve, reject) => {
          const urls = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'https://unpkg.com/@supabase/supabase-js@2'];
          const load = index => {
            if (global.supabase?.createClient) return resolve();
            if (index >= urls.length) return reject(new Error('No se pudo cargar el SDK de Supabase. Revisa tu conexión o bloqueador de contenido.'));
            const script = document.createElement('script');
            script.src = urls[index];
            script.onload = () => global.supabase?.createClient ? resolve() : load(index + 1);
            script.onerror = () => load(index + 1);
            document.head.appendChild(script);
          };
          load(0);
        });
      }
      this.client = global.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        global: { headers: { 'x-application-name': 'mi-cartera' } }
      });
      return this.client;
    },
    async init() {
      const client = await this.ensureClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) return false;
      this.userId = data.user.id;
      this.enabled = true;
      return true;
    },
    async signIn(email, password) {
      const client = await this.ensureClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.userId = data.user.id;
      this.enabled = true;
      return data.user;
    },
    async signUp(email, password) {
      const client = await this.ensureClient();
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user && data.session) { this.userId = data.user.id; this.enabled = true; }
      return data;
    },
    async signOut() {
      const { error } = await this.requireReady().auth.signOut();
      if (error) throw error;
      this.userId = null; this.enabled = false;
    },
    async listFacturasConAnticipos(clienteId) {
      const db = this.requireReady();
      const rows = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await db.from('mc_facturas')
          .select('id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta,mc_anticipos(id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path)')
          .eq('cliente_id', clienteId).order('fecha', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
      }
    },
    async createCliente(row) { return this.insert('mc_clientes', row); },
    async createFactura(row) { return this.insert('mc_facturas', row); },
    async createAnticipo(row) { return this.insert('mc_anticipos', row); },
    requireReady() {
      if (!this.enabled || !this.userId) throw new Error('Configura Supabase e inicia sesión para continuar.');
      return this.client;
    },
    async listClientes(search = '', limit = 100, offset = 0) {
      const db = this.requireReady();
      const rows = [];
      const pageSize = Math.max(1, Math.min(limit, 500));
      for (let pageOffset = offset; ; pageOffset += pageSize) {
        let q = db.from('mc_clientes').select('id,nombre,ruc,updated_at,mc_facturas(id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta,mc_anticipos(id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path))')
          .order('nombre', { ascending: true }).range(pageOffset, pageOffset + pageSize - 1);
        if (search.trim()) q = q.ilike('nombre', `%${search.trim().replace(/[%_]/g, '\\$&')}%`);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return { rows, count: rows.length };
      }
    },
    async getCliente(id) {
      const { data, error } = await this.requireReady().from('mc_clientes')
        .select('id,nombre,ruc').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async listFacturas(clienteId, limit = 100, offset = 0) {
      const { data, error } = await this.requireReady().from('mc_facturas')
        .select('id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos')
        .eq('cliente_id', clienteId).order('fecha', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return data || [];
    },
    async getFactura(id) {
      const { data, error } = await this.requireReady().from('mc_facturas')
        .select('id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta')
        .eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async listAnticipos(facturaId, pageSize = 500) {
      const db = this.requireReady();
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await db.from('mc_anticipos')
          .select('id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path')
          .eq('factura_id', facturaId).order('fecha', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
      }
    },
    async insert(table, row) {
      const db = this.requireReady();
      const { data, error } = await db.from(table).insert({ ...row, user_id: this.userId }).select('id').single();
      if (error) throw error;
      return data;
    },
    async update(table, id, changes) {
      const { error } = await this.requireReady().from(table).update(changes).eq('id', id);
      if (error) throw error;
    },
    async remove(table, id) {
      const { error } = await this.requireReady().from(table).delete().eq('id', id);
      if (error) throw error;
    },
    async upload(path, file) {
      const { data, error } = await this.requireReady().storage.from('mi-cartera').upload(path, file, {
        upsert: false, contentType: file.type, cacheControl: '3600'
      });
      if (error) throw error;
      return data.path;
    },
    async signedUrl(path, expiresIn = 60) {
      const { data, error } = await this.requireReady().storage.from('mi-cartera').createSignedUrl(path, expiresIn);
      if (error) throw error;
      return data.signedUrl;
    },
    async removeStorage(path) {
      if (!path) return;
      const { error } = await this.requireReady().storage.from('mi-cartera').remove([path]);
      if (error) throw error;
    },
    async uploadFacturaArchivo(facturaId, tipo, archivo) {
      const db = this.requireReady();
      const { data: anterior, error: consultaError } = await db.from('mc_archivos_factura')
        .select('storage_path').eq('factura_id', facturaId).eq('tipo', tipo).maybeSingle();
      if (consultaError) throw consultaError;
      const path = `${this.userId}/${facturaId}/${tipo}-${crypto.randomUUID()}-${archivo.name}`;
      const storage_path = await this.upload(path, archivo);
      const { error } = await db.from('mc_archivos_factura').upsert({
        user_id: this.userId, factura_id: facturaId, tipo, storage_path,
        nombre: archivo.name, mime_type: archivo.type, tamano_bytes: archivo.size
      }, { onConflict: 'factura_id,tipo' });
      if (error) { await this.removeStorage(storage_path).catch(() => {}); throw error; }
      if (anterior?.storage_path && anterior.storage_path !== storage_path)
        await this.removeStorage(anterior.storage_path).catch(() => {});
      return storage_path;
    },
    async listArchivosFactura(facturaId) {
      const { data, error } = await this.requireReady().from('mc_archivos_factura')
        .select('id,tipo,storage_path,nombre,mime_type,tamano_bytes').eq('factura_id', facturaId);
      if (error) throw error;
      return data || [];
    },
    async deleteFacturaArchivo(facturaId, tipo) {
      const db = this.requireReady();
      const { data, error } = await db.from('mc_archivos_factura')
        .select('storage_path').eq('factura_id', facturaId).eq('tipo', tipo).maybeSingle();
      if (error) throw error;
      const { error: deleteError } = await db.from('mc_archivos_factura')
        .delete().eq('factura_id', facturaId).eq('tipo', tipo);
      if (deleteError) throw deleteError;
      if (data?.storage_path) await this.removeStorage(data.storage_path).catch(() => {});
    }
  };
  global.MiCarteraDB = api;
})(window);
