// src/lib/icons/category-icons.ts
import {
  Layers,
  Palette,
  Code,
  Wrench,
  Home,
  Camera,
  type Icon as LucideIcon,
  PlugZap,
  Droplets,
  Scissors,
  Truck,
  MonitorCog,
  Hammer,
  PaintRoller,
  Armchair,
  Sparkles,
  BatteryCharging,
  BrushCleaning,
  House,
  Warehouse,
  CarFront,
  Tractor,
  Bike,
  TrendingUp,
  BrainCircuit,
  Megaphone,
  GraduationCap,
  CodeXml,
} from 'lucide-svelte'

const ICON_MAP: Record<string, typeof LucideIcon> = {
  Zap: PlugZap,
  Droplets: Droplets,
  Sparkles: Scissors,
  Truck: Truck,
  Wrench: MonitorCog,
  Paintbrush: PaintRoller,
  Hammer: Hammer,
  Sofa: Armchair,
  Cleaning: BrushCleaning,
  BatteryCharging: BatteryCharging,
  Home: House,
  Transportation: Warehouse,
  Car: CarFront,
  Mototechnics: Tractor,
  Bike: Bike,
  TrendingUp: TrendingUp,
  Cpu: BrainCircuit,
  Megaphone: Megaphone,
  Palette: Palette,
  GraduationCap: GraduationCap,
  Code2: CodeXml,
  а: MonitorCog,
}

const DEFAULT_ICON = Layers

export function getCategoryIcon(
  name: string | null | undefined,
): typeof LucideIcon {
  if (!name) return DEFAULT_ICON
  return ICON_MAP[name] ?? DEFAULT_ICON
}
