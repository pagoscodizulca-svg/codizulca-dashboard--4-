export type RifResolutionSource =
  | 'DATA'
  | 'RIF_BY_ID'
  | 'RIF_BY_NAME'
  | 'FALLBACK_PENDIENTE';

export type TipoResolutionSource =
  | 'DATA'
  | 'TIPO_BY_ID'
  | 'TIPO_BY_NAME'
  | 'FALLBACK_POR_CLASIFICAR';

export interface MaestraSanitizedClient {
  /** Llave compuesta determinística `${idVendedor}::${idCliente}` para evitar colisiones de Id compartido */
  assignmentKey: string;
  /** Llave compuesta por nombre de ruta `${vendedor}::${idCliente}` */
  routeAssignmentKey: string;
  excelRowNumber: number;
  idVendedor: string;
  vendedor: string;
  canonicalSeller: string;
  supervisor: string;
  zona: string;
  idCliente: string;
  razonSocial: string;
  rawRif: string;
  rawTipoCliente: string;
  rif: string;
  tipoCliente: string;
  rifSource: RifResolutionSource;
  tipoSource: TipoResolutionSource;
  isPendingClassification: boolean;
  isSharedClientId: boolean;
  activo: boolean;
}

export interface MaestraDuplicateIdGroup {
  idCliente: string;
  razonSocial: string;
  occurrencesCount: number;
  assignments: Array<{
    excelRowNumber: number;
    idVendedor: string;
    vendedor: string;
    supervisor: string;
    rif: string;
    tipoCliente: string;
    assignmentKey: string;
  }>;
}

export interface MaestraSellerSummary {
  idVendedor: string;
  vendedor: string;
  canonicalSeller: string;
  supervisor: string;
  zona: string;
  activeCount: number;
  pendingCount: number;
  sharedIdsCount: number;
  tiposBreakdown: Record<string, number>;
}

export interface MaestraTipoSummary {
  tipoCliente: string;
  activeCount: number;
  sharePct: number;
  sellersCount: number;
  isPendingBucket: boolean;
}

export interface MaestraParseResult {
  title: string;
  sourceFilename: string;
  totalRowsBelowHeader: number;
  emptyRowsIgnored: number;
  validActiveCount: number;
  distinctClientIdsCount: number;
  sellersCount: number;
  records: MaestraSanitizedClient[];
  pendingRecords: MaestraSanitizedClient[];
  duplicateIdGroups: MaestraDuplicateIdGroup[];
  sellerSummaries: MaestraSellerSummary[];
  tipoClienteSummaries: MaestraTipoSummary[];
}

export interface ExistingActivationRecordLike {
  id?: number | string;
  cliente_codigo?: string;
  cliente_nombre?: string;
  vendedor_id?: string;
  vendedor_nombre?: string;
  status?: string;
  activo?: boolean;
  rif?: string;
  tipoCliente?: string;
  idVendedorErp?: string;
  cajas_aceite?: number;
  cajas_azucar?: number;
  cajas_pollo?: number;
  cajas_estandar_asturias?: number;
  cajas_mortadela_salpicao?: number;
  has_aceite?: boolean;
  has_azucar?: boolean;
  has_pollo?: boolean;
  has_estandar_asturias?: boolean;
  has_mortadela_salpicao?: boolean;
}

export interface ExistingCarteraRecordLike {
  id: string;
  nombre: string;
  vendedor: string;
  rutaVendedor?: string;
  idVendedor?: string;
  canal: string;
  rif?: string;
  zona?: string;
  region?: string;
  activo?: boolean;
}

export type MaestraDiffChangeType =
  | 'ALTA_SUPABASE'
  | 'ALTA_CARTERA'
  | 'REACTIVACION'
  | 'CAMBIO_VENDEDOR_RUTA'
  | 'CAMBIO_TIPO_CLIENTE'
  | 'CAMBIO_RIF'
  | 'SANEAMIENTO_TEXTO';

export interface MaestraDiffRecord {
  assignmentKey: string;
  idCliente: string;
  razonSocial: string;
  idVendedor: string;
  vendedor: string;
  supervisor: string;
  rif: string;
  tipoCliente: string;
  changeTypes: MaestraDiffChangeType[];
  previousVendedor?: string;
  previousTipoCliente?: string;
  previousRif?: string;
  previousRazonSocial?: string;
}

export interface MaestraBajaRecord {
  dbRowId?: number | string;
  idCliente: string;
  razonSocial: string;
  previousVendedor: string;
  supervisor: string;
  previousStatus: string;
  hadPurchasesInPeriod: boolean;
  activo: false;
}

export interface MaestraSellerAuditRow {
  idVendedor: string;
  vendedor: string;
  canonicalSeller: string;
  supervisor: string;
  zona: string;
  previousSupabaseCount: number;
  previousCarteraCount: number;
  excelActiveCount: number;
  deltaSupabase: number;
  deltaCartera: number;
  activadosConCompra: number;
  pctActivacion: number;
  pendingCount: number;
  sharedIdsCount: number;
  topTipos: Array<{ tipo: string; count: number }>;
  tiposBreakdown: Record<string, number>;
}

export interface MaestraAuditReport {
  generatedAt: string;
  syncedAt: string | null;
  sourceFilename: string;
  periodo: string;
  parseMetrics: {
    title: string;
    totalRowsBelowHeader: number;
    emptyRowsIgnored: number;
    validActiveCount: number;
    distinctClientIdsCount: number;
    sellersCount: number;
    pendingCount: number;
    duplicateIdsCount: number;
  };
  auditTotals: {
    previousSupabaseActiveCount: number;
    previousCarteraActiveCount: number;
    newExcelActiveCount: number;
    altasSupabaseCount: number;
    altasCarteraCount: number;
    cambiosVendedorRutaCount: number;
    cambiosTipoClienteCount: number;
    saneamientosTextoCount: number;
    bajasLogicasCount: number;
    pendingRifTipoCount: number;
    duplicateClientIdsCount: number;
  };
  sellerAuditRows: MaestraSellerAuditRow[];
  tipoAuditRows: MaestraTipoSummary[];
  altasList: MaestraDiffRecord[];
  cambiosList: MaestraDiffRecord[];
  bajasLogicasList: MaestraBajaRecord[];
  pendingList: MaestraSanitizedClient[];
  duplicateIdGroups: MaestraDuplicateIdGroup[];
}

export interface MaestraBatchSyncResponse {
  success: boolean;
  syncedAt: string;
  periodo: string;
  batchesProcessed: number;
  upsertedCount: number;
  insertedCount: number;
  logicalDeactivatedCount: number;
  activePortfolioTotal: number;
  sellersTotal: number;
  auditReport: MaestraAuditReport;
}
