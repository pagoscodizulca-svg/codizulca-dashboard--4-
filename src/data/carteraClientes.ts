export interface ClienteItem {
  id: string;
  nombre: string;
  vendedor: string;
  rutaVendedor?: string;
  idVendedor?: string;
  region: string;
  canal: string;
  activo?: boolean;
  rif?: string;
  zona?: string;
}

// Re-export or dynamically provide the clients data
import carteraData from './carteraClientes.json';

export const CARTERA_CLIENTES_WITH_HISTORY: ClienteItem[] = carteraData as ClienteItem[];

export const CARTERA_CLIENTES: ClienteItem[] = CARTERA_CLIENTES_WITH_HISTORY.filter(
  (c) => c.activo !== false
);
