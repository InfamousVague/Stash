/** Brand colors for each framework */
const FRAMEWORK_COLORS: Record<string, string> = {
  next:     '#8b5cf6',
  react:    '#61dafb',
  vue:      '#42b883',
  angular:  '#dd0031',
  express:  '#68a063',
  rails:    '#cc0000',
  python:   '#3776ab',
  laravel:  '#ff2d20',
  rust:     '#dea584',
  go:       '#00add8',
};

export function getFrameworkColor(framework: string | null | undefined): string | undefined {
  if (!framework) return undefined;
  return FRAMEWORK_COLORS[framework];
}
