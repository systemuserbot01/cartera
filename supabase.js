/* Acceso de bajo volumen a Supabase para Mi Cartera.
 * Configurar window.MI_CARTERA_SUPABASE antes de cargar este archivo:
 * { url: 'https://<project>.supabase.co', anonKey: '<publishable/anon key>' }
 * Requiere una sesión de Supabase Auth; nunca usar service_role en el navegador.
 */
(function (global) {
  const blobToDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer un archivo del respaldo.'));
    reader.readAsDataURL(blob);
  });
  const config = global.MI_CARTERA_SUPABASE;
  const api = {
    enabled: false,
    client: null,
    userId: null,
    empresaId: 'MAGROCAM',
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
      try { await this.setEmpresa(localStorage.getItem('mi_cartera_empresa') || 'MAGROCAM'); }
      catch (e) { this.enabled = false; return false; }
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
    async setEmpresa(empresa) {
      if (!['MAGROCAM', 'LEONARDO'].includes(empresa)) throw new Error('Selecciona una empresa válida.');
      if (!this.client || !this.userId) throw new Error('Inicia sesión para acceder a la empresa.');
      const { data, error } = await this.client.rpc('mc_tiene_acceso_empresa', { empresa_solicitada: empresa });
      if (error) throw error;
      if (data !== true) throw new Error(`Tu usuario no tiene acceso a ${empresa}. Solicita que se habilite en Supabase.`);
      this.empresaId = empresa;
      try { localStorage.setItem('mi_cartera_empresa', empresa); } catch (e) {}
    },
    async listFacturasConAnticipos(clienteId) {
      const db = this.requireReady();
      const rows = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await db.from('mc_facturas')
          .select('id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta,mc_anticipos(id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path)')
          .eq('cliente_id', clienteId).eq('empresa_id', this.empresaId).order('fecha', { ascending: false })
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
        let q = db.from('mc_clientes').select('id,nombre,nombre_cliente,ruc,correo,updated_at,mc_facturas(id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta,mc_anticipos(id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path))')
          .eq('empresa_id', this.empresaId).order('nombre', { ascending: true }).range(pageOffset, pageOffset + pageSize - 1);
        if (search.trim()) q = q.ilike('nombre', `%${search.trim().replace(/[%_]/g, '\\$&')}%`);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return { rows, count: rows.length };
      }
    },
    async getCliente(id) {
      const { data, error } = await this.requireReady().from('mc_clientes')
        .select('id,nombre,nombre_cliente,ruc,correo').eq('id', id).eq('empresa_id', this.empresaId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async listFacturas(clienteId, limit = 100, offset = 0) {
      const { data, error } = await this.requireReady().from('mc_facturas')
        .select('id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos')
        .eq('cliente_id', clienteId).eq('empresa_id', this.empresaId).order('fecha', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return data || [];
    },
    async getFactura(id) {
      const { data, error } = await this.requireReady().from('mc_facturas')
        .select('id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta')
        .eq('id', id).eq('empresa_id', this.empresaId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async listAnticipos(facturaId, pageSize = 500) {
      const db = this.requireReady();
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await db.from('mc_anticipos')
          .select('id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path')
          .eq('factura_id', facturaId).eq('empresa_id', this.empresaId).order('fecha', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
      }
    },
    async insert(table, row) {
      const db = this.requireReady();
      const { data, error } = await db.from(table).insert({ ...row, user_id: this.userId, empresa_id: this.empresaId }).select('id').single();
      if (error) throw error;
      return data;
    },
    async update(table, id, changes) {
      const { error } = await this.requireReady().from(table).update(changes).eq('id', id).eq('empresa_id', this.empresaId);
      if (error) throw error;
    },
    async remove(table, id) {
      const { error } = await this.requireReady().from(table).delete().eq('id', id).eq('empresa_id', this.empresaId);
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
    async download(path) {
      const { data, error } = await this.requireReady().storage.from('mi-cartera').download(path);
      if (error) throw error;
      return data;
    },
    async removeStorage(path) {
      if (!path) return;
      const { error } = await this.requireReady().storage.from('mi-cartera').remove([path]);
      if (error) throw error;
    },
    async uploadFacturaArchivo(facturaId, tipo, archivo) {
      const db = this.requireReady();
      const { data: anterior, error: consultaError } = await db.from('mc_archivos_factura')
        .select('storage_path').eq('factura_id', facturaId).eq('empresa_id', this.empresaId).eq('tipo', tipo).maybeSingle();
      if (consultaError) throw consultaError;
      const path = `${this.userId}/${this.empresaId}/${facturaId}/${tipo}-${crypto.randomUUID()}-${archivo.name}`;
      const storage_path = await this.upload(path, archivo);
      const { error } = await db.from('mc_archivos_factura').upsert({
        user_id: this.userId, empresa_id: this.empresaId, factura_id: facturaId, tipo, storage_path,
        nombre: archivo.name, mime_type: archivo.type, tamano_bytes: archivo.size
      }, { onConflict: 'factura_id,tipo' });
      if (error) { await this.removeStorage(storage_path).catch(() => {}); throw error; }
      if (anterior?.storage_path && anterior.storage_path !== storage_path)
        await this.removeStorage(anterior.storage_path).catch(() => {});
      return storage_path;
    },
    async listArchivosFactura(facturaId) {
      const { data, error } = await this.requireReady().from('mc_archivos_factura')
        .select('id,tipo,storage_path,nombre,mime_type,tamano_bytes').eq('factura_id', facturaId).eq('empresa_id', this.empresaId);
      if (error) throw error;
      return data || [];
    },
    async createBackupSnapshot() {
      const db = this.requireReady();
      const [clientsResult, invoicesResult, advancesResult, filesResult] = await Promise.all([
        db.from('mc_clientes').select('id,nombre,nombre_cliente,ruc,correo,created_at,updated_at').eq('empresa_id', this.empresaId).order('created_at'),
        db.from('mc_facturas').select('id,cliente_id,numero,fecha,detalle,valor_centavos,retencion_centavos,retencion_porcentaje,anticipo_inicial_centavos,proforma,cheque,transferencia,banco,cuenta,created_at,updated_at').eq('empresa_id', this.empresaId).order('created_at'),
        db.from('mc_anticipos').select('id,factura_id,fecha,valor_centavos,banco,tipo_movimiento,tipo_cuenta,numero_cheque,respaldo_path,created_at').eq('empresa_id', this.empresaId).order('created_at'),
        db.from('mc_archivos_factura').select('id,factura_id,tipo,storage_path,nombre,mime_type,tamano_bytes,created_at').eq('empresa_id', this.empresaId)
      ]);
      for (const result of [clientsResult, invoicesResult, advancesResult, filesResult]) if (result.error) throw result.error;
      const attachments = [];
      for (const row of filesResult.data || []) {
        const blob = await this.download(row.storage_path);
        attachments.push({ kind: 'invoice', id: row.id, factura_id: row.factura_id, tipo: row.tipo,
          nombre: row.nombre, mime_type: row.mime_type, tamano_bytes: row.tamano_bytes,
          contenido: await blobToDataUrl(blob) });
      }
      for (const row of advancesResult.data || []) if (row.respaldo_path) {
        const blob = await this.download(row.respaldo_path);
        attachments.push({ kind: 'advance', anticipo_id: row.id, nombre: row.respaldo_path.split('/').pop(),
          mime_type: blob.type || 'image/jpeg', tamano_bytes: blob.size, contenido: await blobToDataUrl(blob) });
      }
      return { format: 'mi-cartera-backup', version: 1, created_at: new Date().toISOString(),
        clientes: clientsResult.data || [], facturas: invoicesResult.data || [],
        anticipos: advancesResult.data || [], archivos: attachments };
    },
    async restoreBackup(snapshot) {
      const db = this.requireReady();
      const userId = this.userId;
      const inserted = { clientes: [], facturas: [], anticipos: [], archivos: [], storage: [] };
      const dataUrlToFile = item => {
        const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(item.contenido || '');
        if (!match) throw new Error(`El archivo ${item.nombre || ''} del respaldo no es válido.`);
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], item.nombre || 'archivo', { type: item.mime_type || match[1] });
      };
      const rollback = async () => {
        for (const row of inserted.archivos.reverse()) await db.from('mc_archivos_factura').delete().eq('id', row.id);
        for (const path of inserted.storage) await this.removeStorage(path).catch(() => {});
        for (const row of inserted.anticipos.reverse()) await db.from('mc_anticipos').delete().eq('id', row.id);
        for (const row of inserted.facturas.reverse()) await db.from('mc_facturas').delete().eq('id', row.id);
        for (const row of inserted.clientes.reverse()) await db.from('mc_clientes').delete().eq('id', row.id);
      };
      try {
        for (const row of snapshot.clientes) {
          const { data, error } = await db.from('mc_clientes').insert({ nombre: row.nombre, nombre_cliente: row.nombre_cliente || row.nombreCliente || '', ruc: row.ruc || '', correo: row.correo || '', user_id: userId, empresa_id: this.empresaId }).select('id').single();
          if (error) throw error;
          inserted.clientes.push(data); row._restoredId = data.id;
        }
        const clients = new Map(snapshot.clientes.map(row => [row.id, row._restoredId]));
        for (const row of snapshot.facturas) {
          const { data, error } = await db.from('mc_facturas').insert({
            cliente_id: clients.get(row.cliente_id), user_id: userId, empresa_id: this.empresaId, numero: row.numero, fecha: row.fecha,
            detalle: row.detalle || '', valor_centavos: row.valor_centavos, retencion_centavos: row.retencion_centavos,
            retencion_porcentaje: row.retencion_porcentaje, anticipo_inicial_centavos: row.anticipo_inicial_centavos,
            proforma: row.proforma || '', cheque: row.cheque || '', transferencia: row.transferencia || '', banco: row.banco || '', cuenta: row.cuenta || ''
          }).select('id').single();
          if (error) throw error;
          inserted.facturas.push(data); row._restoredId = data.id;
        }
        const invoices = new Map(snapshot.facturas.map(row => [row.id, row._restoredId]));
        for (const row of snapshot.anticipos) {
          const { data, error } = await db.from('mc_anticipos').insert({
            factura_id: invoices.get(row.factura_id), user_id: userId, empresa_id: this.empresaId, fecha: row.fecha,
            valor_centavos: row.valor_centavos, banco: row.banco || '', tipo_movimiento: row.tipo_movimiento || 'Transferencia',
            tipo_cuenta: row.tipo_cuenta || '', numero_cheque: row.numero_cheque || '', respaldo_path: null
          }).select('id').single();
          if (error) throw error;
          inserted.anticipos.push(data); row._restoredId = data.id;
        }
        const advances = new Map(snapshot.anticipos.map(row => [row.id, row._restoredId]));
        for (const item of snapshot.archivos) {
          const file = dataUrlToFile(item);
          if (item.kind === 'invoice') {
            const facturaId = invoices.get(item.factura_id);
            const path = await this.upload(`${userId}/${this.empresaId}/${facturaId}/backup-${crypto.randomUUID()}-${file.name}`, file);
            inserted.storage.push(path);
            const { data, error } = await db.from('mc_archivos_factura').insert({ user_id: userId, empresa_id: this.empresaId, factura_id: facturaId,
              tipo: item.tipo, storage_path: path, nombre: item.nombre, mime_type: item.mime_type, tamano_bytes: item.tamano_bytes }).select('id').single();
            if (error) throw error;
            inserted.archivos.push(data);
          } else if (item.kind === 'advance') {
            const advanceId = advances.get(item.anticipo_id);
            const path = await this.upload(`${userId}/${this.empresaId}/${advanceId}/backup-${crypto.randomUUID()}-${file.name}`, file);
            inserted.storage.push(path);
            const { error } = await db.from('mc_anticipos').update({ respaldo_path: path }).eq('id', advanceId);
            if (error) throw error;
          }
        }
      for (const row of snapshot.clientes) delete row._restoredId;
      for (const row of snapshot.facturas) delete row._restoredId;
      for (const row of snapshot.anticipos) delete row._restoredId;
      } catch (error) {
        await rollback();
        throw error;
      }
    },
    async deleteFacturaArchivo(facturaId, tipo) {
      const db = this.requireReady();
      const { data, error } = await db.from('mc_archivos_factura')
        .select('storage_path').eq('factura_id', facturaId).eq('empresa_id', this.empresaId).eq('tipo', tipo).maybeSingle();
      if (error) throw error;
      const { error: deleteError } = await db.from('mc_archivos_factura')
        .delete().eq('factura_id', facturaId).eq('empresa_id', this.empresaId).eq('tipo', tipo);
      if (deleteError) throw deleteError;
      if (data?.storage_path) await this.removeStorage(data.storage_path).catch(() => {});
    }
  };
  global.MiCarteraDB = api;
})(window);
