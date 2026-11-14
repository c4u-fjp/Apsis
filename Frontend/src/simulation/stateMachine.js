// Fases de la experiencia: descenso -> alunizado -> ascenso -> abandonado
export const PHASES = ["descent", "landed", "ascent", "abandoned"];

export function createMachine(onChange = () => {}) {
  let phase = "descent";
  const next = {
    descent: "landed",
    landed: "ascent",
    ascent: "abandoned",
    abandoned: "abandoned",
  };
  return {
    get phase() { return phase; },
    advance() { phase = next[phase]; onChange(phase); return phase; },
    reset() { phase = "descent"; onChange(phase); },
  };
}
// Idea: al pasar a "ascent" separa la etapa de ascenso del GLB y deja la de descenso
// en la escena; en "abandoned" muestra el panel narrativo con site.story.
