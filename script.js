"use strict";
const $=id=>document.getElementById(id);
const ICONO_USER=`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>`;
const ICONO_FACTURA=`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>`;
const ICONO_ANTICIPO=`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>`;
const ICONO_CHEVRON=`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
const KEY="control_clientes_minimal_v1";
const VIEW_KEY="mi_cartera_vista_clientes";
let clientes=[],clienteId=null,facturaId=null,editando=false,vista="inicio";
let vistaClientes="detallada";
let authMode="signin", supabaseActive=false, clientesOffset=0;
try{vistaClientes=localStorage.getItem(VIEW_KEY)==="simple"?"simple":"detallada";}catch(e){}
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const hoy=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const cents=v=>Math.round(Number(String(v??0).replace(/[$,\s]/g,"" )||0)*100);
const currencyInput=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents(v)/100);
function bindCurrencyInputs(root=document){root.querySelectorAll("[data-money]").forEach(input=>{if(input.dataset.moneyBound)return;input.dataset.moneyBound="1";input.addEventListener("focus",()=>{input.value=input.value.replace(/[$,\s]/g,"");});input.addEventListener("blur",()=>{if(input.value.trim()!=="")input.value=currencyInput(input.value);});});}
const money=v=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(v/100);
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sum=a=>a.reduce((s,n)=>s+n,0);
const cliente=()=>clientes.find(c=>c.id===clienteId);
const factura=()=>cliente()?.facturas.find(f=>f.id===facturaId);
const anticiposRegistradosTotal=f=>sum(f.anticiposRegistrados.map(a=>a.valor));
const cobrar=f=>f.valor-f.ret;
const saldo=f=>Math.max(0,cobrar(f)-f.anticipos-anticiposRegistradosTotal(f));
const facturado=c=>sum(c.facturas.map(f=>f.valor));
const pagado=c=>sum(c.facturas.map(f=>f.anticipos+anticiposRegistradosTotal(f)));
const deuda=c=>sum(c.facturas.map(saldo));
const cantidadFacturas=()=>sum(clientes.map(c=>c.facturas.length));
const fromDbCliente=r=>({...r,facturas:(r.mc_facturas||[]).map(fromDbFactura)});
const fromDbFactura=r=>({id:r.id,numero:r.numero,fecha:r.fecha,detalle:r.detalle||"",valor:Number(r.valor_centavos),ret:Number(r.retencion_centavos),retPct:r.retencion_porcentaje==null?undefined:Number(r.retencion_porcentaje),anticipos:Number(r.anticipo_inicial_centavos),proforma:r.proforma||"",cheque:r.cheque||"",transf:r.transferencia||"",banco:r.banco||"",cuenta:r.cuenta||"",anticiposRegistrados:(r.mc_anticipos||[]).map(a=>({id:a.id,fecha:a.fecha,valor:Number(a.valor_centavos),banco:a.banco,tipoMovimiento:a.tipo_movimiento||'Transferencia',tipoCuenta:a.tipo_cuenta||'',numeroCheque:a.numero_cheque||'',respaldoPath:a.respaldo_path}))});
function toDbFactura(f,cid){return {cliente_id:cid,numero:f.numero,fecha:f.fecha,detalle:f.detalle||"",valor_centavos:f.valor,retencion_centavos:f.ret,retencion_porcentaje:f.retPct??null,anticipo_inicial_centavos:f.anticipos,proforma:f.proforma||"",cheque:f.cheque||"",transferencia:f.transf||"",banco:f.banco||"",cuenta:f.cuenta||""};}
function authVisible(visible){$("authPanel").classList.toggle("hidden",!visible);document.querySelector("main").classList.toggle("hidden",visible);document.querySelector(".bottom-nav").classList.toggle("hidden",visible);$("btnAgregar").classList.toggle("hidden",visible);}
function cargarClientesRemotos(rows){clientes=rows.map(fromDbCliente);}
function cargar(){
  try{
    const data=JSON.parse(localStorage.getItem(KEY)||"[]");
    clientes=Array.isArray(data)?data:[];
  }catch(e){clientes=[];}
}
function guardar(){
  try{
    localStorage.setItem(KEY,JSON.stringify(clientes));
    return true;
  }catch(e){
    alert("No se pudieron guardar los datos.");
    return false;
  }
}
function aviso(msg){
  $("toast").textContent=msg;
  $("toast").classList.add("show");
  clearTimeout(aviso.timer);
  aviso.timer=setTimeout(()=>$("toast").classList.remove("show"),2400);
}
function navegar(v){
  vista=v;
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id===v));
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.nav===v));
  $("appHeader").classList.toggle("no-header",v!=="inicio");
  if(v==="inicio")renderInicio();
  if(v==="clientes")renderClientes();
  if(v==="detalle")renderDetalle();
  if(v==="factura")renderFactura();
  if(v==="datos")$("btnAgregar").classList.add("hidden");
  else $("btnAgregar").classList.remove("hidden");
  window.scrollTo(0,0);
}
function abrirModal(id){$(id).classList.remove("hidden");}
function cerrar(){document.querySelectorAll(".overlay").forEach(el=>el.classList.add("hidden"));}
function estado(f){
  if(saldo(f)===0)return ["Pagada","paid"];
  if(f.anticipos+anticiposRegistradosTotal(f)>0)return ["Pagada parcialmente","partial"];
  return ["Pendiente",""];
}
function tarjetaCliente(c){
  return `<article class="customer-card" data-cliente="${safe(c.id)}" tabindex="0" role="button">
    <div class="customer-top">
      <div class="avatar">${ICONO_USER}</div>
      <div class="customer-name">
        <h3>${safe(c.nombre)}</h3>
        <p>RUC: ${safe(c.ruc||"No registrado")}</p>
      </div>
      <span class="chevron">${ICONO_CHEVRON}</span>
    </div>
    <div class="customer-divider"></div>
    <div class="customer-metrics">
      <div><small>Facturado</small><strong>${money(facturado(c))}</strong></div>
      <div><small>Anticipos</small><strong>${money(pagado(c))}</strong></div>
      <div><small>Saldo</small><strong class="owed">${money(deuda(c))}</strong></div>
    </div>
    <div class="customer-bottom">
      <span>${c.facturas.length} facturas emitidas</span>
      <span>Ver estado de cuenta ›</span>
    </div>
  </article>`;
}
function tarjetaSimple(c){
  return `<article class="simple-card" data-cliente="${safe(c.id)}" tabindex="0" role="button">
    <div class="avatar">${ICONO_USER}</div>
    <div class="simple-identity">
      <h3>${safe(c.nombre)}</h3>
      <p>RUC: ${safe(c.ruc||"No registrado")}</p>
    </div>
    <div class="simple-amount">
      <small>Saldo</small>
      <strong>${money(deuda(c))}</strong>
    </div>
    <span class="simple-arrow">${ICONO_CHEVRON}</span>
  </article>`;
}
function cambiarVistaClientes(tipo){
  vistaClientes=tipo;
  try{localStorage.setItem(VIEW_KEY,tipo);}catch(e){}
  renderClientes();
}
function renderInicio(){
  $("saldoGlobal").textContent=money(sum(clientes.map(deuda)));
  $("clientesDeudores").textContent=clientes.filter(c=>deuda(c)>0).length+" clientes con saldo";
  $("totalFacturado").textContent=money(sum(clientes.flatMap(c=>c.facturas.map(f=>Math.max(0,f.valor-f.ret)))));
  $("totalAnticipos").textContent=money(sum(clientes.map(pagado)));
  $("totalFacturas").textContent=cantidadFacturas();
  $("totalClientes").textContent=clientes.length;
  const orden=[...clientes].sort((a,b)=>deuda(b)-deuda(a));
  $("clientesInicio").innerHTML=orden.slice(0,5).map(tarjetaCliente).join("")||`<div class="empty">Agrega tu primer cliente para comenzar.</div>`;
}
function renderClientes(){
  const q=$("buscar").value.toLowerCase().trim();
  const lista=clientes.filter(c=>c.nombre.toLowerCase().includes(q)||(c.ruc||"").toLowerCase().includes(q));
  $("contadorClientes").textContent=clientes.length+" clientes";
  $("vistaSimple").classList.toggle("active",vistaClientes==="simple");
  $("vistaDetallada").classList.toggle("active",vistaClientes==="detallada");
  $("vistaSimple").setAttribute("aria-pressed",String(vistaClientes==="simple"));
  $("vistaDetallada").setAttribute("aria-pressed",String(vistaClientes==="detallada"));
  $("listaClientes").classList.toggle("simple-list",vistaClientes==="simple");
  $("listaClientes").innerHTML=lista.map(vistaClientes==="simple"?tarjetaSimple:tarjetaCliente).join("")||`<div class="empty">No hay clientes para mostrar.</div>`;
}
function abrirCliente(id){
  clienteId=id;
  $("buscarFacturaCliente").value="";
  if(supabaseActive){cargarFacturasCliente(id).catch(error=>aviso("No se pudieron cargar las facturas: "+error.message));return;}
  navegar("detalle");
}
async function cargarFacturasCliente(id){const c=cliente();if(!c)return;const rows=await MiCarteraDB.listFacturasConAnticipos(id);c.facturas=rows.map(fromDbFactura);navegar("detalle");}
function renderDetalle(){
  const c=cliente();
  if(!c)return navegar("clientes");
  $("nombreDetalle").textContent=c.nombre;
  $("rucDetalle").textContent="RUC: "+(c.ruc||"No registrado");
  $("avatarDetalle").innerHTML=ICONO_USER;
  $("saldoDetalle").textContent=money(deuda(c));
  $("facturasDetalle").textContent=c.facturas.length+" facturas";
  $("anticiposDetalle").textContent=money(pagado(c))+" en anticipos";
  renderListaFacturas(c);
}
function normalizarBusqueda(valor){return String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();}
function textoBusquedaFactura(f){
  const partes=[];
  const agregar=(valor)=>{if(valor==null)return;if(typeof valor==='object'){if(Array.isArray(valor)){valor.forEach(agregar);return;}for(const [clave,dato] of Object.entries(valor)){if(clave==='contenido')continue;partes.push(clave);agregar(dato);}return;}partes.push(String(valor));};
  agregar(f);
  for(const centavos of [f.valor,f.ret,f.anticipos,...(f.anticiposRegistrados||[]).map(a=>a.valor)])if(Number.isFinite(Number(centavos)))partes.push(money(Number(centavos)));
  return normalizarBusqueda(partes.join(' '));
}
function renderListaFacturas(c=cliente()){
  if(!c)return;
  const q=normalizarBusqueda($("buscarFacturaCliente").value.trim());
  const coincidencias=c.facturas.filter(f=>!q||textoBusquedaFactura(f).includes(q));
  $("cantidadFacturas").textContent=q?`${coincidencias.length} de ${c.facturas.length} facturas`:c.facturas.length+" registros";
  $("listaFacturas").innerHTML=coincidencias.map(f=>{
    const [label,clase]=estado(f);
    return `<article class="invoice-card" data-factura="${safe(f.id)}" tabindex="0" role="button">
      <div class="invoice-top">
        <div class="invoice-identity">
          <div class="invoice-icon">${ICONO_FACTURA}</div>
          <div>
            <h3>Factura ${safe(f.numero)}</h3>
            <p>${safe(f.fecha)} · ${safe(f.detalle||"Sin detalle")}</p>
          </div>
        </div>
        <span class="pill ${clase}">${label}</span>
      </div>
      <div class="invoice-bottom">
        <div><small>Saldo por cobrar</small><strong>${money(saldo(f))}</strong></div>
        <div style="text-align:right"><small>Valor factura</small><b>${money(f.valor)}</b></div>
      </div>
    </article>`;
  }).join("")||(c.facturas.length?`<div class="empty">No hay coincidencias en las facturas de este cliente.</div>`:`<div class="empty">Este cliente todavía no tiene facturas.</div>`);
}
function abrirFactura(id){
  facturaId=id;
  if(supabaseActive){cargarAnticiposFactura(id).catch(error=>aviso("No se pudieron cargar los anticipos: "+error.message));return;}
  navegar("factura");
}
async function cargarAnticiposFactura(id){const f=factura();if(!f)return;f.anticiposRegistrados=await MiCarteraDB.listAnticipos(id);f.anticiposRegistrados=f.anticiposRegistrados.map(a=>({id:a.id,fecha:a.fecha,valor:Number(a.valor_centavos),banco:a.banco,tipoMovimiento:a.tipo_movimiento||'Transferencia',tipoCuenta:a.tipo_cuenta||'',numeroCheque:a.numero_cheque||'',respaldoPath:a.respaldo_path}));navegar("factura");await cargarArchivosFactura(id);}
async function cargarArchivosFactura(id){if(!supabaseActive)return;const f=factura();if(!f)return;const rows=await MiCarteraDB.listArchivosFactura(id);f.archivosRemotos=rows;renderDocumentosEncabezado(f);}
function configurarRetencion(f){
  const select=$("retencionPorcentaje");
  const custom=$("retencionPersonalizada");
  const opciones=["0","1","1.75","2","2.75","3","5","8","10"];
  custom.classList.add("hidden");
  if(typeof f.retPct==="number"&&Number.isFinite(f.retPct)){
    const p=String(f.retPct);
    if(opciones.includes(p)){
      select.value=p;
    }else{
      select.value="custom";
      custom.value=f.retPct;
      custom.classList.remove("hidden");
    }
  }else if(f.ret===0){
    select.value="0";
  }else{
    select.value="fixed";
  }
}
function renderFactura(){
  const f=factura(),c=cliente();
  if(!f||!c)return navegar("detalle");
  $("numeroFactura").textContent=f.numero;
  const [label,clase]=estado(f);
  $("estadoFactura").textContent=label;
  $("estadoFactura").className="pill "+clase;
  $("recCliente").textContent=c.nombre;
  $("recRuc").textContent="RUC: "+(c.ruc||"No registrado");
  $("recFecha").textContent=f.fecha;
  $("recDetalle").textContent=f.detalle||"Servicio / producto";
  $("recPrecio").textContent=money(f.valor);
  $("recValor").textContent=money(f.valor);
  $("recSubtotal").textContent=money(f.valor);
  $("recRetencion").textContent="− "+money(f.ret);
  $("recTotal").textContent=money(cobrar(f));
  configurarRetencion(f);
  $("cantidadAnticipos").textContent=f.anticiposRegistrados.length+" movimientos";
  $("listaAnticipos").innerHTML=f.anticiposRegistrados.map(a=>`
    <div class="anticipo-card">
      <div class="anticipo-icon">${ICONO_ANTICIPO}</div>
      <div class="anticipo-text">
        <small>${safe(a.fecha)}</small>
        <strong>+ ${money(a.valor)}</strong>
      </div>
      <button class="delete-mini" data-editar-anticipo="${safe(a.id)}">Editar</button>
    </div>
  `).join("")||`<div class="empty">Todavía no hay anticipos registrados.</div>`;
}
function abrirEditorMontoRetencion(){const input=$("retencionMontoInput");if(!input)return;$("retencionEditor").classList.remove("hidden");$("editarRetencion").classList.add("hidden");$("retencionValorVisible").classList.add("hidden");input.value=(factura().ret/100).toFixed(2);input.focus();}
function cambiarRetencion(){
  const f=factura();
  if(!f)return;
  if(supabaseActive){cambiarRetencionRemota();return;}
  const select=$("retencionPorcentaje");
  const custom=$("retencionPersonalizada");
  const valor=select.value;
  if(valor==="custom"){
    custom.classList.remove("hidden");
    if(custom.value===""){
      custom.focus();
      return;
    }
  }else{
    custom.classList.add("hidden");
  }
  if(valor==="fixed"){
    custom.classList.add("hidden");
    abrirEditorMontoRetencion();
    return;
  }
  const pct=Number(valor==="custom"?custom.value:valor);
  if(!Number.isFinite(pct)||pct<0||pct>100){
    aviso("Ingresa un porcentaje entre 0 y 100");
    return;
  }
  const ret=Math.round(f.valor*pct/100);
  if(ret+f.anticipos+anticiposRegistradosTotal(f)>f.valor){
    aviso("La retención supera el saldo disponible");
    configurarRetencion(f);
    return;
  }
  const anteriorRet=f.ret;
  const anteriorPct=f.retPct;
  f.ret=ret;
  f.retPct=pct;
  if(!guardar()){
    f.ret=anteriorRet;
    if(anteriorPct===undefined)delete f.retPct;
    else f.retPct=anteriorPct;
    configurarRetencion(f);
    return;
  }
  renderFactura();
  aviso("Retención actualizada");
}
async function cambiarRetencionRemota(){const f=factura(),select=$("retencionPorcentaje"),custom=$("retencionPersonalizada");if(select.value==="fixed"){custom.classList.add("hidden");abrirEditorMontoRetencion();return;}const pct=Number(select.value==="custom"?custom.value:select.value);if(!Number.isFinite(pct)||pct<0||pct>100)return aviso("Ingresa un porcentaje entre 0 y 100");const ret=Math.round(f.valor*pct/100);if(ret+f.anticipos+anticiposRegistradosTotal(f)>f.valor)return aviso("La retención supera el saldo disponible");try{await MiCarteraDB.update('mc_facturas',f.id,{retencion_centavos:ret,retencion_porcentaje:pct,updated_at:new Date().toISOString()});f.ret=ret;f.retPct=pct;renderFactura();aviso("Retención actualizada");}catch(error){aviso("No se pudo actualizar la retención: "+error.message);}}
function nuevoCliente(editar=false){
  editando=editar;
  $("formCliente").reset();
  $("tituloCliente").textContent=editar?"Editar cliente":"Nuevo cliente";
  $("eliminarCliente").classList.toggle("hidden",!editar);
  if(editar){
    const c=cliente();
    if(!c)return;
    $("cNombre").value=c.nombre;
    $("cRuc").value=c.ruc||"";
  }
  abrirModal("modalCliente");
}
function guardarCliente(e){
  e.preventDefault();
  const nombre=$("cNombre").value.trim();
  const ruc=$("cRuc").value.trim();
  if(!nombre)return;
  if(supabaseActive){guardarClienteRemoto(nombre,ruc).catch(error=>aviso("No se pudo guardar el cliente: "+error.message));return;}
  if(editando){
    Object.assign(cliente(),{nombre,ruc});
  }else{
    clientes.push({id:uid(),nombre,ruc,facturas:[]});
  }
  if(!guardar())return;
  cerrar();
  navegar(editando?"detalle":"clientes");
  aviso("Cliente guardado");
}
async function guardarClienteRemoto(nombre,ruc){if(editando){await MiCarteraDB.update('mc_clientes',clienteId,{nombre,ruc,updated_at:new Date().toISOString()});const c=cliente();c.nombre=nombre;c.ruc=ruc;}else{const row=await MiCarteraDB.createCliente({nombre,ruc});clientes.unshift({id:row.id,nombre,ruc,facturas:[]});}cerrar();navegar(editando?"detalle":"clientes");aviso("Cliente guardado");}
function borrarCliente(){
  const c=cliente();
  if(!c||!confirm("¿Eliminar este cliente y todas sus facturas y anticipos?"))return;
  if(supabaseActive){borrarClienteRemoto(c).catch(error=>aviso("No se pudo eliminar el cliente: "+error.message));return;}
  const indice=clientes.findIndex(item=>item.id===c.id);
  if(indice<0)return;
  const [eliminado]=clientes.splice(indice,1);
  if(!guardar()){clientes.splice(indice,0,eliminado);return;}
  cerrar();
  navegar("clientes");
  aviso("Cliente eliminado");
}
async function borrarClienteRemoto(c){await MiCarteraDB.remove('mc_clientes',c.id);cerrar();clienteId=null;navegar("clientes");aviso("Cliente eliminado");}
function nuevaFactura(){
  $("formFactura").reset();
  $("fFecha").value=hoy();
  $("fRet").value=0;
  $("fAnticipos").value=0;
  abrirModal("modalFactura");
}
function guardarFactura(e){
  e.preventDefault();
  const c=cliente();
  if(!c)return;
  const valor=cents($("fValor").value);
  const ret=cents($("fRet").value);
  const anticipos=cents($("fAnticipos").value);
  if(supabaseActive){guardarFacturaRemota(e);return;}
  if(!Number.isSafeInteger(valor)||valor<=0||
     !Number.isSafeInteger(ret)||ret<0||
     !Number.isSafeInteger(anticipos)||anticipos<0||
     ret+anticipos>valor){
    alert("Verifica los valores de factura, retención y anticipos.");
    return;
  }
  const numero=$("fNumero").value.trim();
  if(!numero)return;
  if(c.facturas.some(f=>f.numero.toLowerCase()===numero.toLowerCase())){
    alert("Ya existe una factura con ese número para este cliente.");
    return;
  }
  c.facturas.unshift({
    id:uid(),
    fecha:$("fFecha").value,
    proforma:$("fProforma").value.trim(),
    detalle:$("fDetalle").value.trim(),
    numero,valor,ret,anticipos,
    cheque:$("fCheque").value.trim(),
    transf:$("fTransf").value.trim(),
    banco:$("fBanco").value.trim(),
    cuenta:$("fCuenta").value.trim(),
    anticiposRegistrados:[]
  });
  if(!guardar())return;
  cerrar();
  navegar("detalle");
  aviso("Factura registrada");
}
async function guardarFacturaRemota(e){e.preventDefault();const c=cliente();if(!c)return;const anterior=editandoFactura?factura():null,valor=cents($("fValor").value),ret=anterior?.ret||0,anticipos=anterior?anterior.anticipos:cents($("fAnticipos").value),numero=$("fNumero").value.trim(),fecha=$("fFecha").value,detalle=$("fDetalle").value.trim();if(!Number.isSafeInteger(valor)||valor<=0||!Number.isSafeInteger(anticipos)||anticipos<0||valor<ret+anticipos+anticiposRegistradosTotal(anterior||{anticiposRegistrados:[]})||!numero||!fecha)return aviso("Verifica los valores de la factura y anticipos");if(c.facturas.some(f=>f.numero.toLowerCase()===numero.toLowerCase()&&f.id!==anterior?.id))return aviso("Ya existe una factura con ese número para este cliente");try{let id=anterior?.id;if(anterior){const {error}=await MiCarteraDB.client.from('mc_facturas').update({numero,fecha,detalle,valor_centavos:valor,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;}else{const {data,error}=await MiCarteraDB.client.from('mc_facturas').insert({user_id:MiCarteraDB.userId,...toDbFactura({numero,fecha,detalle,valor,ret,retPct:null,anticipos,proforma:"",cheque:"",transf:"",banco:"",cuenta:""},c.id)}).select('id').single();if(error)throw error;id=data.id;}for(const tipo of ['proforma','factura']){const a=archivosFactura[tipo],yaGuardado=anterior?.archivosRemotos?.some(x=>x.tipo===tipo);if(a?.contenido){const blob=await(await fetch(a.contenido)).blob(),file=new File([blob],a.nombre,{type:a.tipo});await MiCarteraDB.uploadFacturaArchivo(id,tipo,file);}else if(!a&&yaGuardado){await MiCarteraDB.deleteFacturaArchivo(id,tipo);}}archivosFactura={proforma:null,factura:null};editandoFactura=false;cerrar();await cargarFacturasCliente(c.id);if(anterior){facturaId=id;await cargarAnticiposFactura(id);}aviso(anterior?"Factura actualizada":"Factura registrada");}catch(error){aviso("No se pudo guardar la factura: "+error.message);}}
function nuevoAnticipo(){
  const f=factura();
  if(!f||saldo(f)===0){
    aviso("Esta factura no tiene saldo pendiente");
    return;
  }
  $("formAnticipo").reset();
  $("aFecha").value=hoy();
  $("saldoDisponible").textContent=money(saldo(f));
  $("aValor").max=(saldo(f)/100).toFixed(2);
  abrirModal("modalAnticipo");
}
async function guardarAnticipo(e){
  e.preventDefault();
  if(supabaseActive){await guardarAnticipoRemoto(e);return;}
  const f=factura();
  if(!f)return;
  const anterior=anticipoEditandoId?f.anticiposRegistrados.find(a=>a.id===anticipoEditandoId):null;
  const valor=cents($("aValor").value);
  if(!Number.isSafeInteger(valor)||valor<=0||valor>saldo(f)+(anterior?.valor||0)){
    aviso("El anticipo debe ser mayor que cero y no superar el saldo pendiente.");
    return;
  }
  const banco=$("aBanco").value,tipoMovimiento=$("aTipoMovimiento").value,tipoCuenta=tipoMovimiento==='Transferencia'?$("aTipoCuenta").value:'',numeroCheque=tipoMovimiento==='Cheque'?$("aNumeroCheque").value.trim():'';
  if(!BANCOS[banco])return aviso("Selecciona un banco");
  if(tipoMovimiento==='Transferencia'&&!['Ahorro','Corriente'].includes(tipoCuenta))return aviso("Selecciona el tipo de cuenta");
  if(tipoMovimiento==='Cheque'&&!numeroCheque)return aviso("Ingresa el número de cheque");
  const respaldo=respaldoAnticipoEliminado?undefined:(archivoRespaldoAnticipo||anterior?.respaldo),anteriorGuardado=anterior?{...anterior}:null,nuevo=anterior?null:{id:uid(),fecha:$("aFecha").value,valor,banco,tipoMovimiento,tipoCuenta,numeroCheque,respaldo};
  if(anterior)Object.assign(anterior,{fecha:$("aFecha").value,valor,banco,tipoMovimiento,tipoCuenta,numeroCheque,respaldo});
  else f.anticiposRegistrados.unshift(nuevo);
  if(!guardar()){if(anterior)Object.assign(anterior,anteriorGuardado);else f.anticiposRegistrados.shift();return;}
  anticipoEditandoId=null;archivoRespaldoAnticipo=null;respaldoAnticipoEliminado=false;
  cerrar();
  renderFactura();
  aviso(anterior?"Anticipo actualizado":"Anticipo registrado");
}
async function guardarAnticipoRemoto(e){const f=factura(),anterior=anticipoEditandoId?f?.anticiposRegistrados.find(a=>a.id===anticipoEditandoId):null,valor=cents($("aValor").value),banco=$("aBanco").value,tipoMovimiento=$("aTipoMovimiento").value,tipoCuenta=tipoMovimiento==='Transferencia'?$("aTipoCuenta").value:'',numeroCheque=tipoMovimiento==='Cheque'?$("aNumeroCheque").value.trim():'';if(!f||!Number.isSafeInteger(valor)||valor<=0||valor>saldo(f)+(anterior?.valor||0))return aviso("Anticipo fuera del saldo disponible");if(anticipoEditandoId&&!anterior)return aviso("No se encontró el anticipo para editar");if(!BANCOS[banco])return aviso("Selecciona un banco");if(tipoMovimiento==='Transferencia'&&!['Ahorro','Corriente'].includes(tipoCuenta))return aviso("Selecciona el tipo de cuenta");if(tipoMovimiento==='Cheque'&&!numeroCheque)return aviso("Ingresa el número de cheque");try{const rutaAnterior=anterior?.respaldoPath||null;let path=respaldoAnticipoEliminado?null:rutaAnterior;if(archivoRespaldoAnticipo?.contenido){const blob=await(await fetch(archivoRespaldoAnticipo.contenido)).blob(),file=new File([blob],archivoRespaldoAnticipo.nombre,{type:archivoRespaldoAnticipo.tipo}),objectPath=`${MiCarteraDB.userId}/${f.id}/${uid()}-${file.name}`;path=await MiCarteraDB.upload(objectPath,file);}const changes={fecha:$("aFecha").value,valor_centavos:valor,banco,tipo_movimiento:tipoMovimiento,tipo_cuenta:tipoCuenta,numero_cheque:numeroCheque,respaldo_path:path};if(anterior)await MiCarteraDB.update('mc_anticipos',anterior.id,changes);else await MiCarteraDB.createAnticipo({factura_id:f.id,...changes});if(rutaAnterior&&rutaAnterior!==path)await MiCarteraDB.removeStorage(rutaAnterior).catch(()=>{});archivoRespaldoAnticipo=null;anticipoEditandoId=null;respaldoAnticipoEliminado=false;cerrar();await cargarFacturasCliente(clienteId);facturaId=f.id;await cargarAnticiposFactura(f.id);aviso(anterior?"Anticipo actualizado":"Anticipo registrado");}catch(error){aviso("No se pudo guardar el anticipo: "+(error.message||JSON.stringify(error)));}}
async function borrarAnticipo(id){
  const f=factura();
  if(!f||!confirm("¿Eliminar este anticipo?"))return;
  try{
    if(supabaseActive){await MiCarteraDB.remove('mc_anticipos',id);}
    else{const anteriores=f.anticiposRegistrados;f.anticiposRegistrados=anteriores.filter(a=>a.id!==id);if(!guardar()){f.anticiposRegistrados=anteriores;return;}}
    anticipoEditandoId=null;archivoRespaldoAnticipo=null;respaldoAnticipoEliminado=false;cerrar();
    if(supabaseActive){await cargarFacturasCliente(clienteId);facturaId=f.id;await cargarAnticiposFactura(f.id);}else renderFactura();
    aviso("Anticipo eliminado");
  }catch(error){aviso("No se pudo eliminar el anticipo: "+error.message);}
}
function borrarFactura(){
  const c=cliente(),f=factura();
  if(!c||!f||!confirm("¿Eliminar esta factura y todos sus anticipos?"))return;
  if(supabaseActive){MiCarteraDB.remove('mc_facturas',f.id).then(()=>cargarFacturasCliente(c.id)).then(()=>aviso("Factura eliminada")).catch(error=>aviso("No se pudo eliminar la factura: "+error.message));return;}
  c.facturas=c.facturas.filter(x=>x.id!==facturaId);
  if(!guardar())return;
  navegar("detalle");
  aviso("Factura eliminada");
}
function exportar(){
  if(supabaseActive){aviso("La exportación remota y la migración de datos locales aún no están disponibles.");return;}
  const blob=new Blob([JSON.stringify(clientes,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="mi-cartera-"+hoy()+".json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("menu").classList.add("hidden");
}
function validar(datos){
  if(!Array.isArray(datos))return false;
  const ids=new Set();
  for(const c of datos){
    if(!c||typeof c.id!=="string"||ids.has(c.id)||
       typeof c.nombre!=="string"||!c.nombre.trim()||
       !Array.isArray(c.facturas))return false;
    ids.add(c.id);
    const fi=new Set();
    for(const f of c.facturas){
      if(!f||typeof f.id!=="string"||fi.has(f.id)||
         typeof f.numero!=="string"||typeof f.fecha!=="string"||
         !Number.isSafeInteger(f.valor)||f.valor<=0||
         !Number.isSafeInteger(f.ret)||f.ret<0||
         !Number.isSafeInteger(f.anticipos)||f.anticipos<0||
         !Array.isArray(f.anticiposRegistrados))return false;
      if(f.retPct!==undefined&&(!Number.isFinite(f.retPct)||f.retPct<0||f.retPct>100))return false;
      fi.add(f.id);
      const ai=new Set();
      for(const a of f.anticiposRegistrados){
        if(!a||typeof a.id!=="string"||ai.has(a.id)||
           typeof a.fecha!=="string"||
           !Number.isSafeInteger(a.valor)||a.valor<=0)return false;
        ai.add(a.id);
      }
      if(f.ret+f.anticipos+anticiposRegistradosTotal(f)>f.valor)return false;
    }
  }
  return true;
}
async function importar(e){
  if(supabaseActive){aviso("La importación de respaldos a Supabase aún no está disponible.");e.target.value="";return;}
  const file=e.target.files[0];
  if(!file)return;
  try{
    const datos=JSON.parse(await file.text());
    if(!validar(datos))throw Error("Archivo inválido");
    if(!confirm("¿Reemplazar todos los datos actuales por este respaldo?"))return;
    clientes=datos;
    if(!guardar())return;
    clienteId=null;
    facturaId=null;
    navegar("inicio");
    aviso("Respaldo importado");
  }catch(err){
    alert("No se pudo importar el respaldo.");
  }finally{
    e.target.value="";
    $("menu").classList.add("hidden");
  }
}
function agregar(){
  if(vista==="factura")nuevoAnticipo();
  else if(vista==="detalle")nuevaFactura();
  else nuevoCliente();
}
/* FUNCIONES DE LA VERSIÓN ACTUALIZADA */
const ICONO_SUBIR=`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v4h16v-4"/></svg>`;
const ICONO_LAPIZ=`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m15 5 4 4M4 20l4-1 11-11a3 3 0 0 0-4-4L5 15l-1 5Z"/></svg>`;
const ICONO_CLIP=`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="m21 11-9 9a6 6 0 0 1-8-8l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8"/></svg>`;
const MAX_ARCHIVO=1.5*1024*1024;
let archivosFactura={proforma:null,factura:null},editandoFactura=false,seleccionInicio="todos";
let archivoRespaldoAnticipo=null,anticipoEditandoId=null,respaldoAnticipoEliminado=false;
const BANCOS={Guayaquil:"bancoguayaquil.com",Pichincha:"pichincha.com",Machala:"bancomachala.com",Pacifico:"bancodelpacifico.com",Internacional:"bancointernacional.com.ec",Produbanco:"produbanco.com",'Cooperativa Jep':"jep.coop",Bolivariano:"bolivariano.com"};
function renderInicio(){
  const selector=$("filtroClienteInicio"),previo=seleccionInicio;
  selector.innerHTML='<option value="todos">Todos los clientes</option>'+[...clientes].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(c=>`<option value="${safe(c.id)}">${safe(c.nombre)}</option>`).join('');
  if(previo!=="todos"&&!clientes.some(c=>c.id===previo))seleccionInicio="todos";
  selector.value=seleccionInicio;
  const datos=seleccionInicio==="todos"?clientes:clientes.filter(c=>c.id===seleccionInicio);
  const facturas=datos.flatMap(c=>c.facturas),totalNeto=sum(facturas.map(f=>Math.max(0,f.valor-f.ret))),totalSaldo=sum(facturas.map(saldo));
  const totalCobrado=Math.max(0,totalNeto-totalSaldo),porcSaldo=totalNeto?Math.min(100,totalSaldo/totalNeto*100):0,porcCobrado=totalNeto?100-porcSaldo:0;
  $("saldoGlobal").textContent=money(totalSaldo);
  $("clientesDeudores").textContent=datos.filter(c=>deuda(c)>0).length+" clientes con saldo";
  $("totalFacturado").textContent=money(totalNeto);
  $("totalAnticipos").textContent=money(sum(facturas.map(f=>f.anticipos+anticiposRegistradosTotal(f))));
  $("totalFacturas").textContent=facturas.length;
  $("totalClientes").textContent=datos.length;
  const panel=$("clientesInicio");
  if(!totalNeto){panel.innerHTML='<div class="chart-empty">No hay facturas para mostrar en este resumen.</div>';return;}
  panel.innerHTML=`<div class="chart-layout"><div class="chart-ring" role="img" aria-label="Facturación neta: ${money(totalNeto)}. Saldo pendiente: ${money(totalSaldo)} (${porcSaldo.toFixed(1)}%)." style="background:conic-gradient(#83c9f5 0% ${porcSaldo}%,#ffda27 ${porcSaldo}% 100%)"><div class="chart-ring-center"><small>Facturación neta</small><strong>${money(totalNeto)}</strong></div></div><div class="chart-legend"><div class="chart-legend-row"><span class="chart-legend-dot" style="background:#ffda27"></span><div><div class="chart-legend-label">Facturación neta cobrada</div><strong class="chart-legend-value">${money(totalCobrado)}</strong><span class="chart-legend-percent">${porcCobrado.toFixed(1)}%</span></div></div><div class="chart-legend-row"><span class="chart-legend-dot" style="background:#83c9f5"></span><div><div class="chart-legend-label">Saldo pendiente</div><strong class="chart-legend-value">${money(totalSaldo)}</strong><span class="chart-legend-percent">${porcSaldo.toFixed(1)}%</span></div></div></div></div><p class="chart-note">Base del gráfico: valor de facturas menos retenciones. El amarillo representa lo cobrado y el azul el saldo pendiente.</p>`;
}
function configurarFormularioFactura(){
  const form=$("formFactura");
  form.innerHTML=`<label for="fNumero"># Factura</label><input id="fNumero" required maxlength="60" placeholder="Ej. 001-001-000000123"><label for="fFecha">Fecha</label><input id="fFecha" type="date" required><label for="fDetalle">Detalle</label><input id="fDetalle" maxlength="300" placeholder="Descripción de la factura"><label for="fValor">Valor factura</label><input id="fValor" type="text" inputmode="decimal" data-money required placeholder="$0.00"><label for="fAnticipos">Anticipo inicial</label><input id="fAnticipos" type="text" inputmode="decimal" data-money value="$0.00" placeholder="$0.00"><div class="documentos-titulo">Documentos adjuntos</div><div class="documentos-grid"><div><label>Proforma</label><div id="zonaProforma" class="documento-zona" data-tipo="proforma"></div><input id="inputProforma" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden></div><div><label>Factura</label><div id="zonaFactura" class="documento-zona" data-tipo="factura"></div><input id="inputFactura" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden></div></div><p class="documentos-nota">PDF, PNG o JPG. Máximo 1,5 MB por archivo.</p><button class="submit" id="guardarFormularioFactura" type="submit">Guardar factura</button>`;
  bindCurrencyInputs(form);
  for(const tipo of ["proforma","factura"]){
    const zona=$(tipo==="proforma"?"zonaProforma":"zonaFactura"),input=$(tipo==="proforma"?"inputProforma":"inputFactura");
    input.addEventListener("change",()=>{if(input.files[0])seleccionarArchivo(tipo,input.files[0]);});
    zona.addEventListener("click",e=>{if(e.target.closest("[data-eliminar]")){archivosFactura[tipo]=null;input.value="";renderZonaArchivo(tipo);return;}if(!archivosFactura[tipo])input.click();});
    zona.addEventListener("keydown",e=>{if(!archivosFactura[tipo]&&(e.key==="Enter"||e.key===" ")){e.preventDefault();input.click();}});
    zona.addEventListener("dragover",e=>{e.preventDefault();zona.classList.add("arrastrando");});
    zona.addEventListener("dragleave",()=>zona.classList.remove("arrastrando"));
    zona.addEventListener("drop",e=>{e.preventDefault();zona.classList.remove("arrastrando");if(!archivosFactura[tipo]&&e.dataTransfer.files.length===1)seleccionarArchivo(tipo,e.dataTransfer.files[0]);else aviso("Solo se permite un archivo por sección");});
  }
  renderZonaArchivo("proforma");renderZonaArchivo("factura");
}
function renderZonaArchivo(tipo){const zona=$(tipo==="proforma"?"zonaProforma":"zonaFactura");if(!zona)return;const a=archivosFactura[tipo];zona.innerHTML=a?`<div class="documento-cargado"><span class="archivo-icono">${a.tipo==="application/pdf"?"PDF":"IMG"}</span><strong title="${safe(a.nombre)}">${safe(a.nombre)}</strong><small>${((a.tamano??a.tamano_bytes??0)/1024).toFixed(1)} KB</small><button type="button" class="archivo-quitar" data-eliminar aria-label="Eliminar archivo" title="Eliminar archivo">✕</button></div>`:`<div class="documento-drop" role="button" tabindex="0">${ICONO_SUBIR}<strong>Subir archivo</strong><small>Seleccionar o arrastrar</small><small>PDF · PNG · JPG</small></div>`;}
async function seleccionarArchivo(tipo,file){const ext=file.name.split('.').pop().toLowerCase(),ok=(file.type==='application/pdf'&&ext==='pdf')||(file.type==='image/png'&&ext==='png')||(file.type==='image/jpeg'&&['jpg','jpeg'].includes(ext));if(!ok){aviso('Solo PDF, PNG o JPG');return;}if(file.size>MAX_ARCHIVO){aviso('El archivo supera 1,5 MB');return;}const reader=new FileReader();reader.onload=()=>{archivosFactura[tipo]={nombre:file.name,tipo:file.type,tamano:file.size,contenido:reader.result};renderZonaArchivo(tipo);};reader.onerror=()=>aviso('No se pudo leer el archivo');reader.readAsDataURL(file);}
function prepararFactura(editar){
  const f=editar?factura():null;if(editar&&!f)return;
  editandoFactura=editar;$("formFactura").reset();
  $("fNumero").value=f?.numero||'';$("fFecha").value=f?.fecha||hoy();$("fDetalle").value=f?.detalle||'';
  $("fValor").value=f?currencyInput(f.valor/100):'';$("fAnticipos").value=currencyInput(f?f.anticipos/100:0);
  const remoto=tipo=>{const row=f?.archivosRemotos?.find(a=>a.tipo===tipo);return row?{remote:true,nombre:row.nombre,tipo:row.mime_type,tamano:row.tamano_bytes,storage_path:row.storage_path}:null;};
  const localProforma=f?.archivoProforma?{...f.archivoProforma}:null,localFactura=(f?.archivoFactura||f?.archivo)?{...(f.archivoFactura||f.archivo)}:null;
  archivosFactura={proforma:remoto('proforma')||localProforma,factura:remoto('factura')||localFactura};
  renderZonaArchivo('proforma');renderZonaArchivo('factura');
  $("modalFactura").querySelector('.sheet-head h3').textContent=editar?'Editar factura':'Nueva factura';
  $("guardarFormularioFactura").textContent=editar?'Guardar cambios':'Guardar factura';abrirModal('modalFactura');
}
function nuevaFactura(){prepararFactura(false);}
async function editarFactura(){const f=factura();if(!f)return;if(supabaseActive){try{f.archivosRemotos=await MiCarteraDB.listArchivosFactura(f.id);}catch(error){aviso('No se pudieron cargar los adjuntos: '+error.message);return;}}prepararFactura(true);}
function guardarFactura(e){e.preventDefault();if(supabaseActive){guardarFacturaRemota(e);return;}const c=cliente();if(!c)return;const valor=cents($("fValor").value),numero=$("fNumero").value.trim(),fecha=$("fFecha").value,detalle=$("fDetalle").value.trim();if(!Number.isSafeInteger(valor)||valor<=0||!numero||!fecha){aviso('Verifica los campos de la factura');return;}if(c.facturas.some(f=>f.numero.toLowerCase()===numero.toLowerCase()&&(!editandoFactura||f.id!==facturaId))){aviso('El número de factura ya existe');return;}if(editandoFactura){const f=factura();if(!f)return;if(valor<f.ret+f.anticipos+anticiposRegistradosTotal(f)){aviso('El valor no puede ser menor que lo retenido y cobrado');return;}const copia={...f};Object.assign(f,{valor,numero,fecha,detalle,retPct:valor?Number((f.ret/valor*100).toFixed(8)):0});delete f.archivo;delete f.archivoProforma;delete f.archivoFactura;if(archivosFactura.proforma)f.archivoProforma={...archivosFactura.proforma};if(archivosFactura.factura)f.archivoFactura={...archivosFactura.factura};if(!guardar()){Object.keys(f).forEach(k=>delete f[k]);Object.assign(f,copia);return;}cerrar();renderFactura();aviso('Factura actualizada');}else{const nueva={id:uid(),numero,fecha,detalle,valor,ret:0,retPct:0,anticipos:0,proforma:'',cheque:'',transf:'',banco:'',cuenta:'',anticiposRegistrados:[]};if(archivosFactura.proforma)nueva.archivoProforma={...archivosFactura.proforma};if(archivosFactura.factura)nueva.archivoFactura={...archivosFactura.factura};c.facturas.unshift(nueva);if(!guardar()){c.facturas.shift();return;}cerrar();navegar('detalle');aviso('Factura registrada');}archivosFactura={proforma:null,factura:null};editandoFactura=false;}
function configurarEncabezadoFactura(){if(!$("documentosEncabezado")){const titulo=$("numeroFactura")?.closest('h2');if(titulo){const el=document.createElement('div');el.id='documentosEncabezado';el.className='documentos-encabezado';titulo.insertAdjacentElement('afterend',el);}}if(!$("btnEditarFactura")){const linea=document.querySelector('#factura .receipt-topline'),usd=[...linea.children].find(el=>el.textContent.trim()==='USD');if(usd){const boton=document.createElement('button');boton.id='btnEditarFactura';boton.type='button';boton.className='boton-editar-factura';boton.innerHTML=ICONO_LAPIZ+' Editar factura';usd.replaceWith(boton);boton.addEventListener('click',editarFactura);}}$("adjuntoFactura")?.remove();}
function renderDocumentosEncabezado(f){const cont=$("documentosEncabezado");if(!cont)return;const docs=supabaseActive?(f.archivosRemotos||[]).map(a=>({nombre:a.tipo==='proforma'?'Proforma':'Factura',path:a.storage_path})): [['Proforma',f.archivoProforma],['Factura',f.archivoFactura||f.archivo]].filter(x=>x[1]?.contenido).map(([nombre,archivo])=>({nombre,archivo}));cont.innerHTML=docs.length?docs.map((d,i)=>`<button type="button" class="documento-capsula" data-documento="${i}">${ICONO_CLIP} ${safe(d.nombre)}</button>`).join(''):'<span class="documentos-vacios">Sin archivo adjunto</span>';cont.querySelectorAll('[data-documento]').forEach(b=>b.addEventListener('click',async()=>{const d=docs[Number(b.dataset.documento)];if(d.path){try{window.open(await MiCarteraDB.signedUrl(d.path),'_blank','noopener');}catch(error){aviso('No se pudo abrir el archivo: '+error.message);}}else abrirAdjunto(d.archivo);}));}
function abrirAdjunto(a){if(!a?.contenido||!/^data:(application\/pdf|image\/png|image\/jpeg);base64,/i.test(a.contenido)){aviso('Archivo no disponible');return;}try{const [header,base64]=a.contenido.split(','),bin=atob(base64),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:header.slice(5).split(';')[0]}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.download=a.nombre||'documento';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){aviso('No se pudo abrir el documento');}}
function renderZonaRespaldoAnticipo(){const zona=$("aRespaldoZona");if(!zona)return;const a=archivoRespaldoAnticipo;zona.innerHTML=a?.contenido?`<div class="documento-cargado"><img class="anticipo-respaldo-preview" src="${a.contenido}" alt="Vista previa del respaldo"><strong title="${safe(a.nombre)}">${safe(a.nombre)}</strong><small>${(a.tamano/1024).toFixed(1)} KB</small><button type="button" class="archivo-quitar" data-eliminar-respaldo aria-label="Eliminar respaldo" title="Eliminar respaldo">✕</button></div>`:a?.remote?`<div class="documento-cargado"><span class="archivo-icono">IMG</span><strong title="${safe(a.nombre)}">${safe(a.nombre)}</strong><small>Archivo guardado</small><button type="button" class="archivo-quitar" data-eliminar-respaldo aria-label="Eliminar respaldo" title="Eliminar respaldo">✕</button></div>`:`<div class="documento-drop">${ICONO_SUBIR}<strong>Agregar imagen de respaldo</strong><small>Seleccionar o arrastrar</small><small>PNG o JPG · Máximo 1,5 MB</small></div>`;}
function seleccionarRespaldoAnticipo(file){const ext=file.name.split('.').pop().toLowerCase(),ok=(file.type==='image/png'&&ext==='png')||(file.type==='image/jpeg'&&['jpg','jpeg'].includes(ext));if(!ok){aviso('El respaldo debe ser PNG o JPG');return;}if(file.size>MAX_ARCHIVO){aviso('La imagen supera 1,5 MB');return;}const reader=new FileReader();reader.onload=()=>{archivoRespaldoAnticipo={nombre:file.name,tipo:file.type,tamano:file.size,contenido:reader.result};respaldoAnticipoEliminado=false;renderZonaRespaldoAnticipo();};reader.onerror=()=>aviso('No se pudo leer la imagen');reader.readAsDataURL(file);}
function configurarRetencion(f){const select=$("retencionPorcentaje"),custom=$("retencionPersonalizada");custom.classList.add('hidden');if(f.retPct==null&&f.ret>0){select.value='fixed';custom.value='';return;}const pct=Number(f.retPct??0);const match=['0','1','1.75','2','2.75','3','5','8','10'].find(x=>x===String(pct));if(match!==undefined){select.value=match;custom.value='';}else{select.value='custom';custom.value=pct;custom.classList.remove('hidden');}}
function configurarEditorRetencion(){if($("retencionMontoControl"))return;const original=$("recRetencion"),wrap=document.createElement('div');wrap.id='retencionMontoControl';wrap.className='retencion-monto-control';wrap.innerHTML=`<button type="button" id="editarRetencion" class="retencion-pencil" aria-label="Editar retención">${ICONO_LAPIZ}</button><strong id="retencionValorVisible"></strong><div id="retencionEditor" class="retencion-editor hidden"><span>$</span><input id="retencionMontoInput" type="text" inputmode="decimal" data-money min="0"><button type="button" id="guardarRetencionMonto">✓</button><button type="button" id="cancelarRetencionMonto">×</button></div>`;original.replaceWith(wrap);bindCurrencyInputs(wrap);$("editarRetencion").onclick=abrirEditorMontoRetencion;const cancelar=()=>{$("retencionEditor").classList.add('hidden');$("editarRetencion").classList.remove('hidden');$("retencionValorVisible").classList.remove('hidden');};$("cancelarRetencionMonto").onclick=cancelar;$("guardarRetencionMonto").onclick=async()=>{const f=factura(),s=$("retencionMontoInput").value;if(!f||s.trim()===''||!Number.isFinite(cents(s)))return aviso('Valor inválido');const ret=cents(s);if(ret<0||ret+f.anticipos+anticiposRegistradosTotal(f)>f.valor)return aviso('Retención fuera del saldo disponible');const old=f.ret,oldPct=f.retPct;if(supabaseActive){try{await MiCarteraDB.update('mc_facturas',f.id,{retencion_centavos:ret,retencion_porcentaje:null,updated_at:new Date().toISOString()});}catch(error){return aviso('No se pudo guardar la retención: '+error.message);}}else{f.ret=ret;delete f.retPct;if(!guardar()){f.ret=old;if(oldPct===undefined)delete f.retPct;else f.retPct=oldPct;return;}}f.ret=ret;delete f.retPct;cancelar();renderFactura();aviso('Retención actualizada');};$("retencionMontoInput").onkeydown=e=>{if(e.key==='Enter')$("guardarRetencionMonto").click();if(e.key==='Escape')cancelar();};}
function renderFactura(){const f=factura(),c=cliente();if(!f||!c)return navegar('detalle');configurarEncabezadoFactura();configurarEditorRetencion();$("numeroFactura").textContent=f.numero;renderDocumentosEncabezado(f);const [label,clase]=estado(f);$("estadoFactura").textContent=label;$("estadoFactura").className='pill '+clase;$("recCliente").textContent=c.nombre;$("recRuc").textContent='RUC: '+(c.ruc||'No registrado');$("recFecha").textContent=f.fecha;$("recDetalle").textContent=f.detalle||'Servicio / producto';$("recPrecio").textContent=money(f.valor);$("recValor").textContent=money(f.valor);$("recSubtotal").textContent=money(f.valor);$("recTotal").textContent=money(cobrar(f));$("retencionValorVisible").textContent='− '+money(f.ret);$("retencionEditor").classList.add('hidden');$("editarRetencion").classList.remove('hidden');$("retencionValorVisible").classList.remove('hidden');configurarRetencion(f);const movimientos=f.anticipos>0?[{id:'inicial-'+f.id,fecha:f.fecha,valor:f.anticipos,esInicial:true},...f.anticiposRegistrados]:f.anticiposRegistrados;$("cantidadAnticipos").textContent=movimientos.length+' movimientos';$("listaAnticipos").innerHTML=movimientos.map(a=>{const medio=(a.tipoMovimiento||'Transferencia')==='Transferencia'?`Transferencia${a.tipoCuenta?' · '+safe(a.tipoCuenta):''}`:(a.tipoMovimiento==='Cheque'?`Cheque #${safe(a.numeroCheque||'')}`:'Efectivo');return `<div class="anticipo-card"><div class="anticipo-icon">${ICONO_ANTICIPO}</div><div class="anticipo-text"><small>${a.esInicial?'Anticipo inicial · ':''}${safe(a.fecha)}${a.banco?' · Banco '+safe(a.banco):''}${!a.esInicial?' · '+medio:''}</small><strong>+ ${money(a.valor)}</strong>${a.respaldoPath?`<button type="button" class="documento-capsula anticipo-respaldo" data-ver-respaldo="${safe(a.id)}">${ICONO_CLIP} Ver respaldo</button>`:''}</div>${a.esInicial?'':`<button type="button" class="delete-mini" data-editar-anticipo="${safe(a.id)}">Editar</button>`}</div>`;}).join('')||'<div class="empty">Todavía no hay anticipos registrados.</div>';$("listaAnticipos").querySelectorAll('[data-ver-respaldo]').forEach(b=>b.addEventListener('click',async()=>{try{const a=f.anticiposRegistrados.find(x=>x.id===b.dataset.verRespaldo);if(!a?.respaldoPath)throw new Error('No se encontró la ruta del respaldo');const url=await MiCarteraDB.signedUrl(a.respaldoPath);window.open(url,'_blank','noopener');}catch(error){aviso('No se pudo abrir el respaldo: '+error.message);}}));}
function configurarModalAnticipo(editar){$("formAnticipo").reset();$("aTipoMovimiento").value='Transferencia';actualizarCamposMovimiento();$("tituloAnticipo").textContent=editar?'Editar anticipo':'Registrar anticipo';$("formAnticipo").querySelector('.submit').textContent=editar?'Guardar cambios':'Guardar anticipo';$("eliminarAnticipo").classList.toggle('hidden',!editar);$("aValor").max=((saldo(factura())+(editar?factura().anticiposRegistrados.find(a=>a.id===anticipoEditandoId)?.valor||0:0))/100).toFixed(2);$("saldoDisponible").textContent=money(saldo(factura())+(editar?factura().anticiposRegistrados.find(a=>a.id===anticipoEditandoId)?.valor||0:0));}
function nuevoAnticipo(){const f=factura();if(!f||saldo(f)===0)return aviso('Esta factura no tiene saldo pendiente');anticipoEditandoId=null;archivoRespaldoAnticipo=null;respaldoAnticipoEliminado=false;configurarModalAnticipo(false);$("aFecha").value=hoy();actualizarLogoBanco();renderZonaRespaldoAnticipo();abrirModal('modalAnticipo');}
function editarAnticipo(id){const f=factura(),a=f?.anticiposRegistrados.find(item=>item.id===id);if(!a)return aviso('No se encontró el anticipo');anticipoEditandoId=id;respaldoAnticipoEliminado=false;archivoRespaldoAnticipo=a.respaldo|| (a.respaldoPath?{remote:true,nombre:a.respaldoPath.split('/').pop()||'Respaldo guardado'}:null);configurarModalAnticipo(true);$("aFecha").value=a.fecha;$("aValor").value=currencyInput(a.valor/100);$("aBanco").value=a.banco||'';$("aTipoMovimiento").value=a.tipoMovimiento||'Transferencia';$("aTipoCuenta").value=a.tipoCuenta||'';$("aNumeroCheque").value=a.numeroCheque||'';actualizarCamposMovimiento();actualizarLogoBanco();renderZonaRespaldoAnticipo();abrirModal('modalAnticipo');}
function actualizarCamposMovimiento(){const tipo=$("aTipoMovimiento")?.value,cuenta=$("aTipoCuenta"),cheque=$("aNumeroCheque");$("campoTipoCuenta")?.classList.toggle('hidden',tipo!=='Transferencia');$("campoNumeroCheque")?.classList.toggle('hidden',tipo!=='Cheque');$("campoMovimientoDesactivado")?.classList.toggle('hidden',tipo!=='Efectivo');cuenta.required=tipo==='Transferencia';cuenta.disabled=tipo!=='Transferencia';cheque.required=tipo==='Cheque';cheque.disabled=tipo!=='Cheque';if(tipo!=='Transferencia')cuenta.value='';if(tipo!=='Cheque')cheque.value='';}
function actualizarLogoBanco(){const banco=$("aBanco").value,dominio=BANCOS[banco],logo=$("aBancoLogo");if(!logo)return;const inicial=banco==='Cooperativa Jep'?'J':(banco[0]||'B');logo.innerHTML=dominio?`<span class="bank-initial">${safe(inicial)}</span><img src="https://www.google.com/s2/favicons?domain=${dominio}&sz=64" alt="" onload="this.previousElementSibling.style.display='none'" onerror="this.remove()">`:`<span class="bank-initial">${safe(inicial)}</span>`;}
function archivoValidoEnRespaldo(a){return a&&typeof a.nombre==='string'&&typeof a.tipo==='string'&&typeof a.contenido==='string'&&Number.isSafeInteger(a.tamano)&&a.tamano>=0&&a.tamano<=MAX_ARCHIVO&&['application/pdf','image/png','image/jpeg'].includes(a.tipo)&&a.contenido.startsWith('data:'+a.tipo+';base64,');}
function validar(datos){if(!Array.isArray(datos))return false;const ids=new Set();for(const c of datos){if(!c||typeof c.id!=='string'||ids.has(c.id)||typeof c.nombre!=='string'||!c.nombre.trim()||!Array.isArray(c.facturas))return false;ids.add(c.id);const fi=new Set();for(const f of c.facturas){if(!f||typeof f.id!=='string'||fi.has(f.id)||typeof f.numero!=='string'||typeof f.fecha!=='string'||!Number.isSafeInteger(f.valor)||f.valor<=0||!Number.isSafeInteger(f.ret)||f.ret<0||!Number.isSafeInteger(f.anticipos)||f.anticipos<0||!Array.isArray(f.anticiposRegistrados))return false;if(f.retPct!==undefined&&(!Number.isFinite(f.retPct)||f.retPct<0||f.retPct>100))return false;for(const campo of ['archivo','archivoProforma','archivoFactura'])if(f[campo]!==undefined&&!archivoValidoEnRespaldo(f[campo]))return false;fi.add(f.id);const ai=new Set();for(const a of f.anticiposRegistrados){const medio=a?.tipoMovimiento||'Transferencia';if(!a||typeof a.id!=='string'||ai.has(a.id)||typeof a.fecha!=='string'||!Number.isSafeInteger(a.valor)||a.valor<=0||(a.banco!==undefined&&!BANCOS[a.banco])||!['Transferencia','Cheque','Efectivo'].includes(medio)||(medio==='Transferencia'&&!['Ahorro','Corriente'].includes(a.tipoCuenta))||(medio==='Cheque'&&!(a.numeroCheque||'').trim())||(a.respaldo!==undefined&&!archivoValidoEnRespaldo(a.respaldo)))return false;ai.add(a.id);}if(f.ret+f.anticipos+anticiposRegistradosTotal(f)>f.valor)return false;}}return true;}
function aplicarEstilosExtra(){const style=document.createElement('style');style.textContent=`.documentos-titulo{font-size:15px;font-weight:750;margin:20px 0 12px}.documentos-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.documentos-grid>div{min-width:0}.documentos-grid label{display:block;margin-bottom:8px}.documento-zona{min-width:0}.documento-drop,.documento-cargado{height:162px;border:1.5px dashed #c6d4e7;border-radius:13px;background:#f7faff;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:12px 7px;text-align:center;color:#092d62;cursor:pointer}.documento-drop strong{font-size:13px}.documento-drop small{font-size:11px;color:#697b92}.documento-zona.arrastrando .documento-drop{background:#e6f2ff;border-color:#3977bc}.documento-cargado{background:#eef5ff;border-style:solid;cursor:default}.documento-cargado strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.documento-cargado small{font-size:11px}.archivo-icono{background:#dceafa;padding:7px;border-radius:8px;font-weight:800;font-size:12px}.documento-cargado button{border:0;background:white;color:#c44545;padding:7px 10px;border-radius:8px;font-size:12px}.documentos-nota{font-size:12px;color:#697b92}.documentos-encabezado{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.documento-capsula{display:inline-flex;align-items:center;gap:5px;border:1px solid #d6e3f5;border-radius:99px;padding:6px 11px;background:#edf4ff;color:#092d62;font-size:11px;font-weight:750}.documentos-vacios{font-size:12px;color:#a3adbc}.boton-editar-factura{display:inline-flex;align-items:center;gap:6px;border:1px solid #d5e1f1;border-radius:9px;background:#f0f5fc;color:#092d62;padding:8px 11px;font-size:12px;font-weight:750;letter-spacing:0}.retencion-monto-control{display:flex;align-items:center;justify-content:flex-end;gap:5px;min-width:0}.retencion-pencil{display:grid;place-items:center;width:29px;height:29px;border:0;border-radius:8px;background:#eaf1fc;color:#092d62}.retencion-editor{display:flex;align-items:center;gap:3px;border:1px solid #c7d7ec;border-radius:8px;padding:4px;background:white}.retencion-editor input{width:76px!important;min-width:0;margin:0!important;padding:4px!important;border:0!important;background:transparent!important;font-size:13px;text-align:right}.retencion-editor button{border:0;border-radius:6px;padding:6px;color:#092d62;background:#eaf1fc}.retencion-monto-control .hidden{display:none!important}.anticipo-respaldo{margin-top:8px}.anticipo-respaldo .documento-drop,.anticipo-respaldo .documento-cargado{height:150px}.anticipo-respaldo .documento-cargado{width:100%;box-sizing:border-box}.anticipo-respaldo-preview{width:100%;height:68px;object-fit:contain;border-radius:7px}.anticipo-respaldo{margin:6px 0 0;padding:4px 9px;cursor:pointer}`;document.head.appendChild(style);}
document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>navegar(b.dataset.nav)));
$("vistaSimple").addEventListener("click",()=>cambiarVistaClientes("simple"));
$("vistaDetallada").addEventListener("click",()=>cambiarVistaClientes("detallada"));
$("retencionPorcentaje").addEventListener("change",cambiarRetencion);
$("retencionPersonalizada").addEventListener("change",cambiarRetencion);
$("btnAgregar").addEventListener("click",agregar);
$("volverClientes").addEventListener("click",()=>navegar("clientes"));
$("volverDetalle").addEventListener("click",()=>navegar("detalle"));
$("editarCliente").addEventListener("click",()=>nuevoCliente(true));
$("buscar").addEventListener("input",()=>{clientesOffset=0;renderClientes();});
$("buscarFacturaCliente").addEventListener("input",()=>renderListaFacturas());
$("authToggle").addEventListener("click",()=>{authMode=authMode==="signin"?"signup":"signin";$("authTitle").textContent=authMode==="signin"?"Mi Cartera":"Crear cuenta";$("authDescription").textContent=authMode==="signin"?"Inicia sesión para acceder a tus datos.":"Regístrate con tu correo y contraseña.";$("authSubmit").textContent=authMode==="signin"?"Iniciar sesión":"Crear cuenta";$("authToggle").textContent=authMode==="signin"?"Crear cuenta":"Ya tengo una cuenta";$("authPassword").autocomplete=authMode==="signin"?"current-password":"new-password";$("authMessage").textContent="";});
$("authForm").addEventListener("submit",async e=>{e.preventDefault();$("authMessage").textContent="Conectando…";try{const email=$("authEmail").value.trim(),password=$("authPassword").value;if(authMode==="signin")await MiCarteraDB.signIn(email,password);else{const result=await MiCarteraDB.signUp(email,password);if(!result.session){$("authMessage").textContent="Revisa tu correo para confirmar la cuenta y luego inicia sesión.";return;}}await iniciarAplicacionRemota();}catch(error){$("authMessage").textContent=error.message||"No se pudo iniciar sesión.";}});
$("btnCerrarSesion").addEventListener("click",async()=>{try{await MiCarteraDB.signOut();supabaseActive=false;clientes=[];clienteId=null;facturaId=null;authVisible(true);$("btnCerrarSesion").classList.add("hidden");}catch(error){aviso("No se pudo cerrar la sesión: "+error.message);}});
$("formCliente").addEventListener("submit",guardarCliente);
$("eliminarCliente").addEventListener("click",borrarCliente);
$("formFactura").addEventListener("submit",guardarFactura);
$("formAnticipo").addEventListener("submit",guardarAnticipo);
$("eliminarAnticipo").addEventListener("click",()=>{if(anticipoEditandoId)borrarAnticipo(anticipoEditandoId);});
$("aRespaldoInput").addEventListener("change",e=>{if(e.target.files[0])seleccionarRespaldoAnticipo(e.target.files[0]);e.target.value="";});
$("aRespaldoZona").addEventListener("click",e=>{if(e.target.closest("[data-eliminar-respaldo]")){archivoRespaldoAnticipo=null;respaldoAnticipoEliminado=true;$("aRespaldoInput").value="";renderZonaRespaldoAnticipo();return;}if(!archivoRespaldoAnticipo?.contenido)$("aRespaldoInput").click();});
$("aRespaldoZona").addEventListener("keydown",e=>{if(!archivoRespaldoAnticipo?.contenido&&(e.key==="Enter"||e.key===" ")){e.preventDefault();$("aRespaldoInput").click();}});
$("aRespaldoZona").addEventListener("dragover",e=>{e.preventDefault();$("aRespaldoZona").classList.add("arrastrando");});
$("aRespaldoZona").addEventListener("dragleave",()=>$("aRespaldoZona").classList.remove("arrastrando"));
$("aRespaldoZona").addEventListener("drop",e=>{e.preventDefault();$("aRespaldoZona").classList.remove("arrastrando");if(!archivoRespaldoAnticipo?.contenido&&e.dataTransfer.files.length===1)seleccionarRespaldoAnticipo(e.dataTransfer.files[0]);else aviso("Solo se permite una imagen de respaldo");});
$("eliminarFactura").addEventListener("click",borrarFactura);
$("btnMenu").addEventListener("click",()=>$("menu").classList.toggle("hidden"));
$("exportar").addEventListener("click",exportar);
$("exportarDatos").addEventListener("click",exportar);
$("importarDatos").addEventListener("click",()=>$("archivo").click());
$("importar").addEventListener("click",()=>$("archivo").click());
$("archivo").addEventListener("change",importar);
document.querySelectorAll(".close").forEach(b=>b.addEventListener("click",cerrar));
document.querySelectorAll(".overlay").forEach(m=>m.addEventListener("click",e=>{
  if(e.target===m)cerrar();
}));
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")cerrar();
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-cliente],[data-factura]")){
    e.preventDefault();
    e.target.click();
  }
});
document.addEventListener("click",e=>{
  const ab=e.target.closest("[data-editar-anticipo]");
  if(ab){editarAnticipo(ab.dataset.editarAnticipo);return;}
  const f=e.target.closest("[data-factura]");
  if(f){abrirFactura(f.dataset.factura);return;}
  const c=e.target.closest("[data-cliente]");
  if(c)abrirCliente(c.dataset.cliente);
});
configurarFormularioFactura();
bindCurrencyInputs();
aplicarEstilosExtra();
$("filtroClienteInicio").addEventListener("change",e=>{seleccionInicio=e.target.value;renderInicio();});
$("aBanco").addEventListener("change",actualizarLogoBanco);
$("aTipoMovimiento").addEventListener("change",actualizarCamposMovimiento);
cargar();
async function iniciarAplicacionRemota(){supabaseActive=true;authVisible(false);$("btnCerrarSesion").classList.remove("hidden");$("topMenuPlaceholder")?.remove();$("btnMenu").parentElement.appendChild($("btnCerrarSesion"));$("filtroClienteInicio").disabled=false;$("filtroClienteInicio").title="";try{const rows=await MiCarteraDB.listClientes("",500,0);cargarClientesRemotos(rows.rows);navegar("inicio");}catch(error){authVisible(true);$("authMessage").textContent="No se pudieron cargar los datos. Revisa las políticas de Supabase: "+error.message;}}
async function iniciar(){authVisible(true);$("authMessage").textContent="Comprobando sesión…";try{if(await MiCarteraDB.init()){await iniciarAplicacionRemota();}else{$("authMessage").textContent="Inicia sesión para conectarte a tus datos en Supabase.";}}catch(error){$("authMessage").textContent=error.message||"No se pudo conectar con Supabase.";}}
iniciar();
