// ============================================================
// PersonaMindMap Component — Merged Version v3
// Layout: 12-column Tailwind grid with independent Avatar row
// Style: beige/teal CSS variables
// Avatar: Pixel art SVG with 36 variants (6 mobility × 3 age × 2 gender)
// Design Mode: drag + resize sections, export/import JSON, localStorage
// ============================================================

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import type {
  PersonaData,
  ExperienceData,
  AccumulatedState,
  ComputedOutputs,
} from "@/lib/store";
import SliderField from "@/components/SliderField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ================================================================
// Pixel Art SVG Avatar System — 36 variants
// ================================================================

function Px({ x, y, c, s = 1 }: { x: number; y: number; c: string; s?: number }) {
  return <rect x={x * 4} y={y * 4} width={4 * s} height={4} fill={c} />;
}

const PALETTES = {
  male_young: { skin: "#F2C5A0", hair: "#5B3A29", shirt: "#3B6EA5", pants: "#3A4A5C", shoe: "#2C2C2C" },
  female_young: { skin: "#F2C5A0", hair: "#8B4513", shirt: "#C75B7A", pants: "#4A4A6A", shoe: "#4A3030" },
  male_child: { skin: "#F5D0B0", hair: "#6B4226", shirt: "#5B9BD5", pants: "#6A7A8A", shoe: "#3C3C3C" },
  female_child: { skin: "#F5D0B0", hair: "#A0522D", shirt: "#E8829B", pants: "#7A6A9A", shoe: "#5A3A4A" },
  male_elderly: { skin: "#E8B890", hair: "#C0C0C0", shirt: "#6B7B5A", pants: "#5A5A5A", shoe: "#3A3A3A" },
  female_elderly: { skin: "#E8B890", hair: "#D3D3D3", shirt: "#8B6B7A", pants: "#5A5A6A", shoe: "#4A3A3A" },
};

function getAvatarVariant(agent: PersonaData["agent"]): {
  ageGroup: "child" | "young" | "elderly";
  gender: "male" | "female";
  mobility: "normal" | "wheelchair" | "cane" | "blind" | "blind_wheelchair" | "blind_cane";
} {
  const ageGroup = agent.age < 18 ? "child" : agent.age >= 60 ? "elderly" : "young";
  const gender = agent.gender === "female" ? "female" : "male";
  const isBlind = agent.vision === "severe_impairment";
  let mobility: "normal" | "wheelchair" | "cane" | "blind" | "blind_wheelchair" | "blind_cane";
  if (isBlind && agent.mobility === "wheelchair") mobility = "blind_wheelchair";
  else if (isBlind && (agent.mobility === "cane" || agent.mobility === "walker")) mobility = "blind_cane";
  else if (isBlind) mobility = "blind";
  else if (agent.mobility === "wheelchair") mobility = "wheelchair";
  else if (agent.mobility === "cane" || agent.mobility === "walker") mobility = "cane";
  else mobility = "normal";
  return { ageGroup, gender, mobility };
}

function getLabel(v: ReturnType<typeof getAvatarVariant>): string {
  const age = v.ageGroup === "child" ? "Child" : v.ageGroup === "elderly" ? "Elderly" : "Adult";
  const gen = v.gender === "female" ? "F" : "M";
  const mob = {
    normal: "", wheelchair: " · WC", cane: " · Cane",
    blind: " · Blind", blind_wheelchair: " · Blind+WC", blind_cane: " · Blind+Cane",
  }[v.mobility];
  return `${age} ${gen}${mob}`;
}

// ================================================================
// Pixel Art Body Renderers (32×40 grid at 4x = 128×160)
// ================================================================

function PixelBody_Normal({ p, isChild, isElderly, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isElderly: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 6 : 4;
  const bodyY = headY + 7;
  const legY = bodyY + (isChild ? 6 : 8);
  const bodyH = isChild ? 6 : 8;
  const headSize = isChild ? 5 : 6;
  const bodyW = isChild ? 4 : 5;
  const cx = 16;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 1} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 2} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 1} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 2} c={p.hair} />
          {!isChild && (
            <>
              <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 3} c={p.hair} />
              <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 3} c={p.hair} />
              <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 4} c={p.hair} />
              <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 4} c={p.hair} />
            </>
          )}
        </>
      ) : (
        <>
          {Array.from({ length: headSize }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
          ))}
          {isElderly && (
            <>
              <Px x={cx - Math.floor(headSize / 2)} y={headY} c={p.hair} />
              <Px x={cx + Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
            </>
          )}
        </>
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`face${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 1} y={headY + 2} c="#333" />
      <Px x={cx + 1} y={headY + 2} c="#333" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      <Px x={cx - 1} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`body${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row}
            c={isFemale && row >= bodyH - 2 ? p.pants : p.shirt} />
        ))
      )}
      {Array.from({ length: isChild ? 4 : 5 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: isChild ? 4 : 5 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {isElderly && (
        <>
          <Px x={cx - Math.floor(bodyW / 2) - 2} y={bodyY + 2} c={p.skin} />
          <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 2} c={p.skin} />
        </>
      )}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`ll${i}`} x={cx - 1} y={legY + i} c={p.pants} />
      ))}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`lr${i}`} x={cx + 1} y={legY + i} c={p.pants} />
      ))}
      <Px x={cx - 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx - 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
    </g>
  );
}

function PixelBody_Wheelchair({ p, isChild, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 4 : 2;
  const headSize = isChild ? 5 : 6;
  const cx = 16;
  const bodyY = headY + headSize + 1;
  const bodyH = isChild ? 5 : 6;
  const bodyW = isChild ? 4 : 5;
  const chairY = bodyY + bodyH - 1;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 1} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 1} c={p.hair} />
        </>
      ) : (
        Array.from({ length: headSize }, (_, i) => (
          <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
        ))
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`f${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 1} y={headY + 2} c="#333" />
      <Px x={cx + 1} y={headY + 2} c="#333" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`b${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row} c={p.shirt} />
        ))
      )}
      {Array.from({ length: 4 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`sl${i}`} x={cx - 1 - i} y={chairY + 1} c={p.pants} />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`sr${i}`} x={cx + 1 + i} y={chairY + 1} c={p.pants} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Px key={`seat${i}`} x={cx - 4 + i} y={chairY} c="#666" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <Px key={`back${i}`} x={cx + 4} y={chairY - 4 + i} c="#666" />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`wl${i}`} x={cx - 4 + i} y={chairY + 2} c="#444" />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`wr${i}`} x={cx + 2 + i} y={chairY + 2} c="#444" />
      ))}
      <Px x={cx - 3} y={chairY + 3} c="#555" />
      <Px x={cx + 3} y={chairY + 3} c="#555" />
      <Px x={cx - 3} y={chairY + 2} c="#888" />
      <Px x={cx + 3} y={chairY + 2} c="#888" />
      <Px x={cx - 3} y={chairY + 2} c={p.shoe} />
      <Px x={cx + 3} y={chairY + 2} c={p.shoe} />
    </g>
  );
}

function PixelBody_Cane({ p, isChild, isElderly, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isElderly: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 6 : 4;
  const headSize = isChild ? 5 : 6;
  const cx = 14;
  const bodyY = headY + headSize + 1;
  const bodyH = isChild ? 6 : 8;
  const bodyW = isChild ? 4 : 5;
  const legY = bodyY + bodyH;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
        </>
      ) : (
        Array.from({ length: headSize }, (_, i) => (
          <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
        ))
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`f${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 1} y={headY + 2} c="#333" />
      <Px x={cx + 1} y={headY + 2} c="#333" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`b${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row} c={p.shirt} />
        ))
      )}
      {Array.from({ length: isChild ? 4 : 5 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: isChild ? 3 : 4 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {/* Cane */}
      {Array.from({ length: isChild ? 10 : 14 }, (_, i) => (
        <Px key={`cane${i}`} x={cx + Math.floor(bodyW / 2) + 3} y={bodyY + 2 + i} c="#8B7355" />
      ))}
      <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 2} c="#8B7355" />
      {isElderly && (
        <>
          <Px x={cx - Math.floor(bodyW / 2) - 2} y={bodyY + 2} c={p.skin} />
          <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 2} c={p.skin} />
        </>
      )}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`ll${i}`} x={cx - 1} y={legY + i} c={p.pants} />
      ))}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`lr${i}`} x={cx + 1} y={legY + i} c={p.pants} />
      ))}
      <Px x={cx - 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx - 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
    </g>
  );
}

function PixelBody_Blind({ p, isChild, isElderly, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isElderly: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 6 : 4;
  const headSize = isChild ? 5 : 6;
  const cx = 14;
  const bodyY = headY + headSize + 1;
  const bodyH = isChild ? 6 : 8;
  const bodyW = isChild ? 4 : 5;
  const legY = bodyY + bodyH;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 1} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 1} c={p.hair} />
        </>
      ) : (
        Array.from({ length: headSize }, (_, i) => (
          <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
        ))
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`f${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      {/* Sunglasses */}
      <Px x={cx - 2} y={headY + 2} c="#111" />
      <Px x={cx - 1} y={headY + 2} c="#111" />
      <Px x={cx} y={headY + 2} c="#222" />
      <Px x={cx + 1} y={headY + 2} c="#111" />
      <Px x={cx + 2} y={headY + 2} c="#111" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`b${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row} c={p.shirt} />
        ))
      )}
      {Array.from({ length: isChild ? 4 : 5 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: isChild ? 3 : 4 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {/* White cane */}
      {Array.from({ length: isChild ? 10 : 14 }, (_, i) => (
        <Px key={`wc${i}`} x={cx + Math.floor(bodyW / 2) + 3} y={bodyY + 2 + i} c="#EEEEEE" />
      ))}
      <Px x={cx + Math.floor(bodyW / 2) + 3} y={bodyY + (isChild ? 11 : 15)} c="#CC3333" />
      <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 2} c="#EEEEEE" />
      {isElderly && (
        <Px x={cx - Math.floor(bodyW / 2) - 2} y={bodyY + 2} c={p.skin} />
      )}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`ll${i}`} x={cx - 1} y={legY + i} c={p.pants} />
      ))}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`lr${i}`} x={cx + 1} y={legY + i} c={p.pants} />
      ))}
      <Px x={cx - 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx - 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
    </g>
  );
}

function PixelBody_BlindWheelchair({ p, isChild, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 4 : 2;
  const headSize = isChild ? 5 : 6;
  const cx = 16;
  const bodyY = headY + headSize + 1;
  const bodyH = isChild ? 5 : 6;
  const bodyW = isChild ? 4 : 5;
  const chairY = bodyY + bodyH - 1;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
        </>
      ) : (
        Array.from({ length: headSize }, (_, i) => (
          <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
        ))
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`f${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 2} y={headY + 2} c="#111" />
      <Px x={cx - 1} y={headY + 2} c="#111" />
      <Px x={cx} y={headY + 2} c="#222" />
      <Px x={cx + 1} y={headY + 2} c="#111" />
      <Px x={cx + 2} y={headY + 2} c="#111" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`b${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row} c={p.shirt} />
        ))
      )}
      {Array.from({ length: 4 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {/* White cane on lap */}
      {Array.from({ length: 5 }, (_, i) => (
        <Px key={`wc${i}`} x={cx - 2 + i} y={chairY - 1} c="#EEEEEE" />
      ))}
      <Px x={cx + 3} y={chairY - 1} c="#CC3333" />
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`sl${i}`} x={cx - 1 - i} y={chairY + 1} c={p.pants} />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`sr${i}`} x={cx + 1 + i} y={chairY + 1} c={p.pants} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Px key={`seat${i}`} x={cx - 4 + i} y={chairY} c="#666" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <Px key={`back${i}`} x={cx + 4} y={chairY - 4 + i} c="#666" />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`wl${i}`} x={cx - 4 + i} y={chairY + 2} c="#444" />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Px key={`wr${i}`} x={cx + 2 + i} y={chairY + 2} c="#444" />
      ))}
      <Px x={cx - 3} y={chairY + 3} c="#555" />
      <Px x={cx + 3} y={chairY + 3} c="#555" />
    </g>
  );
}

function PixelBody_BlindCane({ p, isChild, isElderly, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isElderly: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 6 : 4;
  const headSize = isChild ? 5 : 6;
  const cx = 16;
  const bodyY = headY + headSize + 1;
  const bodyH = isChild ? 6 : 8;
  const bodyW = isChild ? 4 : 5;
  const legY = bodyY + bodyH;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
        </>
      ) : (
        Array.from({ length: headSize }, (_, i) => (
          <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
        ))
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`f${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 2} y={headY + 2} c="#111" />
      <Px x={cx - 1} y={headY + 2} c="#111" />
      <Px x={cx} y={headY + 2} c="#222" />
      <Px x={cx + 1} y={headY + 2} c="#111" />
      <Px x={cx + 2} y={headY + 2} c="#111" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`b${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row} c={p.shirt} />
        ))
      )}
      {/* Left arm + wooden cane */}
      {Array.from({ length: isChild ? 3 : 4 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: isChild ? 10 : 14 }, (_, i) => (
        <Px key={`cane${i}`} x={cx - Math.floor(bodyW / 2) - 3} y={bodyY + 2 + i} c="#8B7355" />
      ))}
      <Px x={cx - Math.floor(bodyW / 2) - 2} y={bodyY + 2} c="#8B7355" />
      {/* Right arm + white cane */}
      {Array.from({ length: isChild ? 3 : 4 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: isChild ? 10 : 14 }, (_, i) => (
        <Px key={`wc${i}`} x={cx + Math.floor(bodyW / 2) + 3} y={bodyY + 2 + i} c="#EEEEEE" />
      ))}
      <Px x={cx + Math.floor(bodyW / 2) + 3} y={bodyY + (isChild ? 11 : 15)} c="#CC3333" />
      <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 2} c="#EEEEEE" />
      {isElderly && (
        <>
          <Px x={cx - Math.floor(bodyW / 2) - 2} y={bodyY + 1} c={p.skin} />
          <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 1} c={p.skin} />
        </>
      )}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`ll${i}`} x={cx - 1} y={legY + i} c={p.pants} />
      ))}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`lr${i}`} x={cx + 1} y={legY + i} c={p.pants} />
      ))}
      <Px x={cx - 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx - 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
    </g>
  );
}

function PixelAvatar({ persona, color, size = 120 }: { persona: PersonaData; color: string; size?: number }) {
  const variant = getAvatarVariant(persona.agent);
  const label = getLabel(variant);
  const paletteKey = `${variant.gender}_${variant.ageGroup}` as keyof typeof PALETTES;
  const p = PALETTES[paletteKey];
  const isChild = variant.ageGroup === "child";
  const isElderly = variant.ageGroup === "elderly";
  const isFemale = variant.gender === "female";
  const canvasW = 128;
  const canvasH = 160;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size * (canvasH / canvasW)} viewBox={`0 0 ${canvasW} ${canvasH}`}
        xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: "pixelated" }}>
        <circle cx={canvasW / 2} cy={canvasH / 2} r={55} fill={`${color}12`} stroke={`${color}30`} strokeWidth={1} />
        {variant.mobility === "normal" && <PixelBody_Normal p={p} isChild={isChild} isElderly={isElderly} isFemale={isFemale} />}
        {variant.mobility === "wheelchair" && <PixelBody_Wheelchair p={p} isChild={isChild} isFemale={isFemale} />}
        {variant.mobility === "cane" && <PixelBody_Cane p={p} isChild={isChild} isElderly={isElderly} isFemale={isFemale} />}
        {variant.mobility === "blind" && <PixelBody_Blind p={p} isChild={isChild} isElderly={isElderly} isFemale={isFemale} />}
        {variant.mobility === "blind_wheelchair" && <PixelBody_BlindWheelchair p={p} isChild={isChild} isFemale={isFemale} />}
        {variant.mobility === "blind_cane" && <PixelBody_BlindCane p={p} isChild={isChild} isElderly={isElderly} isFemale={isFemale} />}
      </svg>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", fontWeight: 600, color, letterSpacing: "0.5px" }}>
        {label}
      </span>
    </div>
  );
}

// ================================================================
// Inline Editable Field
// ================================================================

function EditableField({
  value, onChange, type = "text", suffix, options, highlight,
}: {
  value: string | number; onChange: (val: string) => void;
  type?: "text" | "number" | "time" | "select"; suffix?: string;
  options?: { value: string; label: string }[]; highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current instanceof HTMLInputElement) ref.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== String(value)) onChange(draft);
  };

  if (editing) {
    if (type === "select" && options) {
      return (
        <select ref={ref as React.RefObject<HTMLSelectElement>} value={draft}
          onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)} className="sa-input" style={{ minWidth: 80, fontSize: "12px" }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input ref={ref as React.RefObject<HTMLInputElement>}
        type={type === "time" ? "time" : type === "number" ? "number" : "text"}
        value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        step={type === "number" ? "any" : undefined} className="sa-input text-right"
        style={{ width: type === "time" ? 90 : Math.max(60, String(value).length * 10 + 30), fontSize: "12px" }} />
    );
  }

  return (
    <span onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="cursor-pointer px-2 py-0.5 rounded-md transition-all hover:bg-[var(--muted)]"
      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600,
        color: highlight ? "var(--destructive)" : "var(--foreground)" }}
      title="Click to edit">
      {value}
      {suffix && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 3 }}>{suffix}</span>}
    </span>
  );
}

// ================================================================
// Reusable Sub-Components
// ================================================================

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)", letterSpacing: "0.3px" }}>{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

/** Read-only color bar for environment values — similar to SliderField but non-interactive */
function EnvReadOnlyBar({
  label, value, min, max, suffix, color,
}: {
  label: string; value: number; min: number; max: number; suffix?: string; color: string;
}) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const decimals = value % 1 !== 0 ? (value < 1 ? 2 : 1) : 0;
  return (
    <div className="py-1.5">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--foreground)" }}>
          {value.toFixed(decimals)}
          {suffix && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 2 }}>{suffix}</span>}
        </span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 4, background: "var(--muted)" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}90, ${color})`,
          borderRadius: 4,
          transition: "width 0.4s ease",
        }} />
      </div>
      <div className="flex justify-between mt-1">
        <span style={{ fontSize: "9px", color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{min}</span>
        <span style={{ fontSize: "9px", color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{max}</span>
      </div>
    </div>
  );
}

function StaticRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600, color: "var(--foreground)" }}>
        {value}
        {unit && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

function LoadBar({ label, value, prevValue }: { label: string; value: number; prevValue?: number }) {
  const getColor = (v: number) => v <= 0.3 ? "#2E8B6A" : v <= 0.6 ? "#D4A017" : "#C44040";
  const color = getColor(value);
  const hasPrev = prevValue != null && prevValue !== 0;
  const delta = hasPrev ? value - (prevValue ?? 0) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-medium w-14 shrink-0" style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>{label}</span>
      <div className="flex-1 relative" style={{ height: 5, background: "var(--muted)", borderRadius: 3 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${value * 100}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span className="text-xs w-6 text-right shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--foreground)", fontSize: "10px" }}>
        {value.toFixed(1)}
      </span>
      {hasPrev && Math.abs(delta) >= 0.01 && (
        <span className="text-xs w-8 text-right shrink-0" style={{ fontWeight: 600, color: delta > 0 ? "#C44040" : "#2E8B6A", fontSize: "10px" }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function SectionTag({ label, icon, color }: { label: string; icon: string; color?: string }) {
  const c = color || "var(--primary)";
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-md"
      style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "1.2px",
        textTransform: "uppercase" as const, color: c, border: `1.5px solid ${c}`, background: `${c}10` }}>
      <span style={{ fontSize: "11px" }}>{icon}</span> {label}
    </div>
  );
}

function Panel({ children, className = "", style = {} }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`sa-panel ${className}`} style={{ padding: "12px", ...style }}>
      {children}
    </div>
  );
}

// ================================================================
// SVG Connection Lines
// ================================================================

function ConnectionLines({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  useEffect(() => {
    const calc = () => {
      const el = containerRef.current;
      if (!el) return;
      const persona = el.querySelector("[data-node='persona']");
      if (!persona) return;
      const nodes = el.querySelectorAll("[data-node]:not([data-node='persona'])");
      const rect = el.getBoundingClientRect();
      const pRect = persona.getBoundingClientRect();
      const cx = pRect.left + pRect.width / 2 - rect.left;
      const cy = pRect.top + pRect.height / 2 - rect.top;
      const newLines: typeof lines = [];
      nodes.forEach((node) => {
        const nRect = node.getBoundingClientRect();
        const nx = nRect.left + nRect.width / 2 - rect.left;
        const ny = nRect.top + nRect.height / 2 - rect.top;
        newLines.push({ x1: cx, y1: cy, x2: nx, y2: ny });
      });
      setLines(newLines);
    };
    calc();
    window.addEventListener("resize", calc);
    const t = setTimeout(calc, 300);
    return () => { window.removeEventListener("resize", calc); clearTimeout(t); };
  }, [containerRef]);
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
      <defs>
        <marker id="dot" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4">
          <circle cx="3" cy="3" r="3" fill="var(--primary)" opacity="0.4" />
        </marker>
      </defs>
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="var(--primary)" strokeWidth="1" strokeDasharray="6 4" opacity="0.25" markerEnd="url(#dot)" />
      ))}
    </svg>
  );
}

// ================================================================
// Design Intervention Arrow Mock-up
// ================================================================

function InterventionArrow() {
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="text-xs font-semibold tracking-wider mb-2" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
        DESIGN INTERVENTION
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 p-2 text-center rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-inset)" }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>BEFORE</div>
          <div className="text-lg font-bold" style={{ color: "#C44040", fontFamily: "'JetBrains Mono', monospace" }}>4</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>Comfort</div>
        </div>
        <div className="flex flex-col items-center gap-1 px-1">
          <span className="font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "8px", letterSpacing: "0.5px" }}>+WINDOW</span>
          <svg width="30" height="10" viewBox="0 0 30 10">
            <defs><marker id="ah2" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 6 2.5, 0 5" fill="var(--primary)" />
            </marker></defs>
            <line x1="2" y1="5" x2="24" y2="5" stroke="var(--primary)" strokeWidth="1.5" markerEnd="url(#ah2)" />
          </svg>
          <span className="font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "8px", letterSpacing: "0.5px" }}>+LIGHT</span>
        </div>
        <div className="flex-1 p-2 text-center rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-inset)" }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>AFTER</div>
          <div className="text-lg font-bold" style={{ color: "#2E8B6A", fontFamily: "'JetBrains Mono', monospace" }}>7</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>Comfort</div>
        </div>
      </div>
      <div className="text-xs mt-1.5 text-center" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
        Mock-up: Intervention Feedback Loop
      </div>
    </div>
  );
}

// ================================================================
// Show Formula Modal
// ================================================================

function FormulaModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="sa-btn w-full mt-2" style={{ fontSize: "11px", padding: "8px 12px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none" }}>
          Show Formulas
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" style={{ background: "var(--card)", border: "1px solid var(--border)", maxHeight: "80vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Inter', sans-serif", color: "var(--foreground)" }}>Computation Formulas</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "var(--primary)" }}>PMV — Predicted Mean Vote (ISO 7730 Fanger)</h4>
            <div className="p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8 }}>
              <div>PMV = f(M, W, I<sub>cl</sub>, f<sub>cl</sub>, t<sub>a</sub>, t<sub>r</sub>, v<sub>ar</sub>, p<sub>a</sub>)</div>
              <div className="mt-2" style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>PMV = [0.303 × exp(-0.036 × M) + 0.028] × L</div>
              <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>where L = internal heat production - heat loss</div>
              <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                M = metabolic rate (W/m²) &nbsp;|&nbsp; W = external work (≈0)<br />
                I<sub>cl</sub> = clothing insulation (clo) &nbsp;|&nbsp; f<sub>cl</sub> = clothing area factor<br />
                t<sub>a</sub> = air temperature (°C) &nbsp;|&nbsp; t<sub>r</sub> = mean radiant temp (°C)<br />
                v<sub>ar</sub> = relative air velocity (m/s) &nbsp;|&nbsp; p<sub>a</sub> = water vapour pressure (Pa)
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "var(--primary)" }}>PPD — Predicted Percentage Dissatisfied</h4>
            <div className="p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8 }}>
              <div>PPD = 100 - 95 × exp(-0.03353 × PMV⁴ - 0.2179 × PMV²)</div>
              <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Range: 5% (PMV=0, neutral) → 100% (extreme discomfort)</div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "#D4A017" }}>Enclosure Ratio — Ray Casting Method</h4>
            <div className="p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8 }}>
              <div>Enclosure = 1 - (open_rays / total_rays)</div>
              <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>16 rays cast from agent position at 22.5° intervals<br />Each ray checks intersection with walls and room boundaries<br />Max ray distance: 10,000mm (10m)</div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "#D4A017" }}>Effective Lux — Vision-Adjusted Illuminance</h4>
            <div className="p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8 }}>
              <div>Eff.Lux = base_lux + Σ(window_influence × distance_decay)</div>
              <div className="mt-2" style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Window influence: max +400 lux, quadratic decay over 5000mm</div>
              <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Vision adjustment: normal ×1.0 | mild ×0.5 | severe ×0.15</div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "#C44040" }}>Perceived dB — Hearing-Adjusted Noise</h4>
            <div className="p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8 }}>
              <div>Pr.dB = base_dB × hearing_factor</div>
              <div className="mt-2" style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Hearing factor: normal ×1.0 | impaired ×0.6 | deaf ×0.1</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ================================================================
// PMV Warnings
// ================================================================

function PMVWarnings({ computedOutputs }: { computedOutputs: ComputedOutputs }) {
  const warnings = computedOutputs.pmv_warnings || [];
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 px-2 py-2 rounded-lg" style={{ background: "#FFF8E1", border: "1px solid #E8D48A", fontSize: "10px" }}>
      <div className="font-semibold mb-0.5" style={{ color: "#8A6D00", letterSpacing: "0.5px" }}>PMV Notes</div>
      {warnings.map((w, i) => <div key={i} style={{ color: "#6B5500", lineHeight: 1.5 }}>{w}</div>)}
    </div>
  );
}

// ================================================================
// Design Mode — Layout Config Types & Persistence
// ================================================================

const SECTION_KEYS = ["agent", "position", "environment", "avatar", "persona", "experience", "spatial", "outputs", "perceptual"] as const;
type SectionKey = typeof SECTION_KEYS[number];

interface SectionLayout {
  x: number; // percentage offset from natural position
  y: number;
  w: number; // percentage width (0 = use natural)
  h: number; // percentage height (0 = use natural)
}

type LayoutConfig = Record<SectionKey, SectionLayout>;

const EMPTY_LAYOUT: LayoutConfig = {
  "agent": {
    "x": -1,
    "y": 12,
    "w": 0,
    "h": 0
  },
  "position": {
    "x": 0,
    "y": 12,
    "w": 0,
    "h": 0
  },
  "environment": {
    "x": 0,
    "y": 12,
    "w": 0,
    "h": 0
  },
  "avatar": {
    "x": 0,
    "y": 1,
    "w": 0,
    "h": 0
  },
  "persona": {
    "x": 0,
    "y": -4,
    "w": 0,
    "h": 0
  },
  "experience": {
    "x": -1,
    "y": -22,
    "w": 0,
    "h": 0
  },
  "spatial": {
    "x": 0,
    "y": -22,
    "w": 0,
    "h": 0
  },
  "outputs": {
    "x": 0,
    "y": -22,
    "w": 0,
    "h": 0
  },
  "perceptual": {
    "x": 0,
    "y": -33,
    "w": 0,
    "h": 0
  }
};

const STORAGE_KEY = "sentiarch-design-layout";

function loadLayout(): LayoutConfig {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return { ...EMPTY_LAYOUT };
    const parsed = JSON.parse(s);
    // Validate all keys exist
    for (const k of SECTION_KEYS) {
      if (!parsed[k] || typeof parsed[k].x !== "number") return { ...EMPTY_LAYOUT };
    }
    return parsed;
  } catch {
    return { ...EMPTY_LAYOUT };
  }
}

function saveLayout(config: LayoutConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

// ================================================================
// Draggable/Resizable Section Wrapper
// ================================================================

function DesignSection({
  sectionKey, designMode, layout, onLayoutChange, children, className = "", style = {},
}: {
  sectionKey: SectionKey;
  designMode: boolean;
  layout: LayoutConfig;
  onLayoutChange: (key: SectionKey, partial: Partial<SectionLayout>) => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const sl = layout[sectionKey];

  // Drag handlers
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (!designMode) return;
    // Don't drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest("input, select, button, textarea, .sa-input, .sa-btn, [role='dialog']")) return;
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: sl.x, origY: sl.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      onLayoutChange(sectionKey, {
        x: dragState.current.origX + dx,
        y: dragState.current.origY + dy,
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [designMode, sl.x, sl.y, sectionKey, onLayoutChange]);

  // Resize handlers
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    if (!designMode) return;
    e.preventDefault();
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: rect.width, origH: rect.height };

    const onMove = (ev: MouseEvent) => {
      if (!resizeState.current) return;
      const dw = ev.clientX - resizeState.current.startX;
      const dh = ev.clientY - resizeState.current.startY;
      onLayoutChange(sectionKey, {
        w: Math.max(100, resizeState.current.origW + dw),
        h: Math.max(50, resizeState.current.origH + dh),
      });
    };
    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [designMode, sectionKey, onLayoutChange]);

  const transform = sl.x !== 0 || sl.y !== 0 ? `translate(${sl.x}px, ${sl.y}px)` : undefined;
  const customWidth = sl.w > 0 ? sl.w : undefined;
  const customHeight = sl.h > 0 ? sl.h : undefined;

  return (
    <div
      ref={elRef}
      className={className}
      onMouseDown={onDragStart}
      style={{
        ...style,
        transform,
        width: customWidth,
        height: customHeight,
        overflow: customHeight ? "auto" : undefined,
        position: "relative",
        cursor: designMode ? "grab" : undefined,
        outline: designMode ? "2px dashed var(--primary)" : undefined,
        outlineOffset: designMode ? "2px" : undefined,
        transition: dragState.current || resizeState.current ? "none" : "transform 0.2s ease",
        userSelect: designMode ? "none" : undefined,
        zIndex: designMode ? 10 : undefined,
      }}
    >
      {/* Section label in design mode */}
      {designMode && (
        <div style={{
          position: "absolute", top: -10, left: 4, background: "var(--primary)",
          color: "var(--primary-foreground)", fontSize: "8px", fontWeight: 700,
          padding: "1px 6px", borderRadius: "3px", zIndex: 20, letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}>
          {sectionKey}
        </div>
      )}
      {children}
      {/* Resize handle */}
      {designMode && (
        <div
          onMouseDown={onResizeStart}
          style={{
            position: "absolute", bottom: 0, right: 0, width: 16, height: 16,
            cursor: "nwse-resize", zIndex: 20,
            background: "linear-gradient(135deg, transparent 50%, var(--primary) 50%)",
            borderRadius: "0 0 4px 0", opacity: 0.7,
          }}
        />
      )}
    </div>
  );
}

// ================================================================
// Design Mode Toolbar
// ================================================================

function DesignToolbar({
  designMode, setDesignMode, layout, onReset, onImport,
}: {
  designMode: boolean;
  setDesignMode: (v: boolean) => void;
  layout: LayoutConfig;
  onReset: () => void;
  onImport: (config: LayoutConfig) => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleExport = () => {
    const json = JSON.stringify(layout, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {
      // Fallback: prompt
      prompt("Copy this layout JSON:", json);
    });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText);
      // Validate
      for (const k of SECTION_KEYS) {
        if (!parsed[k] || typeof parsed[k].x !== "number") {
          alert("Invalid layout JSON: missing or malformed section '" + k + "'");
          return;
        }
      }
      onImport(parsed);
      setShowImport(false);
      setImportText("");
    } catch {
      alert("Invalid JSON format");
    }
  };

  const btnBase: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", padding: "5px 12px",
    borderRadius: "6px", border: "1.5px solid var(--border)", cursor: "pointer",
    fontFamily: "'Inter', sans-serif", transition: "all 0.15s ease",
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      {/* Toggle */}
      <button
        onClick={() => setDesignMode(!designMode)}
        style={{
          ...btnBase,
          background: designMode ? "var(--primary)" : "var(--card)",
          color: designMode ? "var(--primary-foreground)" : "var(--foreground)",
          border: designMode ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
        }}
      >
        {designMode ? "✓ Design Mode ON" : "⚙ Design Mode"}
      </button>

      {designMode && (
        <>
          {/* Export */}
          <button onClick={handleExport} style={{ ...btnBase, background: "var(--card)", color: "var(--foreground)" }}>
            {copyFeedback ? "✓ Copied!" : "↗ Export Layout"}
          </button>

          {/* Import */}
          <button onClick={() => setShowImport(!showImport)} style={{ ...btnBase, background: "var(--card)", color: "var(--foreground)" }}>
            ↙ Import Layout
          </button>

          {/* Reset */}
          <button onClick={onReset} style={{ ...btnBase, background: "#C4404015", color: "#C44040", border: "1.5px solid #C4404040" }}>
            ↺ Reset
          </button>

          {/* Grid toggle hint */}
          <span style={{ fontSize: "9px", color: "var(--muted-foreground)", fontStyle: "italic" }}>
            Drag sections to move · Corner handle to resize
          </span>
        </>
      )}

      {/* Import panel */}
      {showImport && (
        <div className="w-full mt-2 p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--foreground)" }}>Paste Layout JSON:</div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            className="w-full p-2 rounded-md text-xs"
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
              background: "var(--card)", border: "1px solid var(--border)",
              color: "var(--foreground)", resize: "vertical",
            }}
            placeholder='{"agent":{"x":0,"y":0,"w":0,"h":0},...}'
          />
          <div className="flex gap-2 mt-2">
            <button onClick={handleImport} style={{ ...btnBase, background: "var(--primary)", color: "var(--primary-foreground)", border: "none" }}>
              Apply
            </button>
            <button onClick={() => { setShowImport(false); setImportText(""); }} style={{ ...btnBase, background: "var(--card)", color: "var(--foreground)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// Main Component
// ================================================================

export default function PersonaMindMap({
  persona, experience, accumulatedState, computedOutputs, ruleTriggers,
  prevExperience, prevAccumulatedState, onPersonaChange,
  hasSimulated = true, personaColor, agentPlaced = false,
}: {
  persona: PersonaData;
  experience: ExperienceData;
  accumulatedState: AccumulatedState;
  computedOutputs: ComputedOutputs;
  ruleTriggers: string[];
  prevExperience: ExperienceData | null;
  prevAccumulatedState: AccumulatedState | null;
  onPersonaChange: (p: PersonaData) => void;
  hasSimulated?: boolean;
  personaColor?: { primary: string; secondary: string; bg: string; label: string };
  agentPlaced?: boolean;
}) {
  const { agent, position, environment, spatial } = persona;
  const containerRef = useRef<HTMLDivElement>(null);

  // Design Mode state
  const [designMode, setDesignMode] = useState(false);
  const [layout, setLayout] = useState<LayoutConfig>(() => loadLayout());

  // Persist layout changes
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  const handleLayoutChange = useCallback((key: SectionKey, partial: Partial<SectionLayout>) => {
    setLayout((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...partial },
    }));
  }, []);

  const handleReset = useCallback(() => {
    setLayout({ ...EMPTY_LAYOUT });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleImport = useCallback((config: LayoutConfig) => {
    setLayout(config);
  }, []);

  const updateAgent = useCallback((key: string, val: string) => {
    const parsed = ["age", "metabolic_rate", "clothing_insulation"].includes(key) ? parseFloat(val) || 0 : val;
    onPersonaChange({ ...persona, agent: { ...persona.agent, [key]: parsed } });
  }, [persona, onPersonaChange]);

  const updatePosition = useCallback((key: string, val: string) => {
    const parsed = ["duration_in_cell"].includes(key) ? parseInt(val) || 0 : val;
    onPersonaChange({ ...persona, position: { ...persona.position, [key]: parsed } });
  }, [persona, onPersonaChange]);

  const updateEnv = useCallback((key: string, val: string) => {
    onPersonaChange({ ...persona, environment: { ...persona.environment, [key]: parseFloat(val) || 0 } });
  }, [persona, onPersonaChange]);

  const updateSpatial = useCallback((key: string, val: string) => {
    onPersonaChange({ ...persona, spatial: { ...persona.spatial, [key]: parseFloat(val) || 0 } });
  }, [persona, onPersonaChange]);

  const comfortDelta = hasSimulated && prevExperience && prevExperience.comfort_score > 0
    ? experience.comfort_score - prevExperience.comfort_score : null;

  const mbtiOptions = [
    "ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP",
    "ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ",
  ].map((m) => ({ value: m, label: m }));

  const getComfortColor = (score: number) => {
    if (score === 0) return { bg: "var(--muted)", text: "var(--muted-foreground)" };
    if (score <= 3) return { bg: "#C44040", text: "#FFFFFF" };
    if (score <= 5) return { bg: "#D4A017", text: "#FFFFFF" };
    if (score <= 7) return { bg: "#2A8F7E", text: "#FFFFFF" };
    return { bg: "#1D6B5E", text: "#FFFFFF" };
  };

  const getTrendInfo = (trend: string) => {
    if (trend === "declining") return { icon: "▼", label: "Declining", color: "#C44040" };
    if (trend === "rising") return { icon: "▲", label: "Improving", color: "#1D6B5E" };
    return { icon: "—", label: "Stable", color: "var(--muted-foreground)" };
  };

  const accentColor = personaColor?.primary || "var(--primary)";

  // Wrapper shorthand
  const DS = useCallback(({ k, children, className = "", style = {} }: {
    k: SectionKey; children: ReactNode; className?: string; style?: React.CSSProperties;
  }) => (
    <DesignSection sectionKey={k} designMode={designMode} layout={layout}
      onLayoutChange={handleLayoutChange} className={className} style={style}>
      {children}
    </DesignSection>
  ), [designMode, layout, handleLayoutChange]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Design Mode Toolbar */}
      <DesignToolbar
        designMode={designMode}
        setDesignMode={setDesignMode}
        layout={layout}
        onReset={handleReset}
        onImport={handleImport}
      />



      {/* SVG Connection Lines removed for cleaner layout */}

      {/* 12-COLUMN TAILWIND GRID */}
      <div className="relative grid grid-cols-12 gap-3 md:gap-4" style={{ zIndex: 1 }}>

        {/* ── ROW 1: AGENT (col-span-5) ── */}
        <DS k="agent" className="col-span-12 md:col-span-5">
          <div data-node="agent">
            <SectionTag label="AGENT" icon="◆" color={accentColor} />
            <Panel style={{ borderTop: `3px solid ${accentColor}` }}>
              <DataRow label="ID">
                <EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" />
              </DataRow>
              <DataRow label="Age">
                <EditableField value={agent.age} onChange={(v) => updateAgent("age", v)} type="number" />
              </DataRow>
              <DataRow label="Gender">
                <EditableField value={agent.gender} onChange={(v) => updateAgent("gender", v)} type="select"
                  options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
              </DataRow>
              <DataRow label="MBTI">
                <EditableField value={agent.mbti} onChange={(v) => updateAgent("mbti", v)} type="select" options={mbtiOptions} />
              </DataRow>
              <DataRow label="Mobility">
                <EditableField value={agent.mobility} onChange={(v) => updateAgent("mobility", v)} type="select"
                  options={[
                    { value: "normal", label: "Normal" }, { value: "walker", label: "Walker" },
                    { value: "wheelchair", label: "Wheelchair" }, { value: "cane", label: "Cane" },
                  ]} />
              </DataRow>
              <DataRow label="Hearing">
                <EditableField value={agent.hearing} onChange={(v) => updateAgent("hearing", v)} type="select"
                  options={[
                    { value: "normal", label: "Normal" }, { value: "impaired", label: "Impaired" },
                    { value: "deaf", label: "Deaf" },
                  ]} />
              </DataRow>
              <DataRow label="Vision">
                <EditableField value={agent.vision} onChange={(v) => updateAgent("vision", v)} type="select"
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "mild_impairment", label: "Mild Impairment" },
                    { value: "severe_impairment", label: "Severe Impairment" },
                  ]} />
              </DataRow>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <SliderField label="Met" value={agent.metabolic_rate} min={0.8} max={4} step={0.05}
                  onChange={(v) => updateAgent("metabolic_rate", String(v))} color={accentColor} />
                <SliderField label="Clo" value={agent.clothing_insulation} min={0} max={2} step={0.05}
                  onChange={(v) => updateAgent("clothing_insulation", String(v))} color={accentColor} />
              </div>
            </Panel>
          </div>
        </DS>

        {/* ── ROW 1: POSITION (col-span-3) ── */}
        <DS k="position" className="col-span-12 md:col-span-3">
          <div data-node="position">
            <SectionTag label="POSITION" icon="◇" color="#D4A017" />
            <Panel>
              <StaticRow label="Cell" value={`[${position.cell[0]}, ${position.cell[1]}]`} />
              <DataRow label="Time">
                <EditableField value={position.timestamp} onChange={(v) => updatePosition("timestamp", v)} type="time" />
              </DataRow>
              <DataRow label="Dur.">
                <EditableField value={position.duration_in_cell} onChange={(v) => updatePosition("duration_in_cell", v)} suffix="min" />
              </DataRow>
            </Panel>
          </div>
        </DS>

        {/* ── ROW 1: ENVIRONMENT (col-span-4) ── */}
        <DS k="environment" className="col-span-12 md:col-span-4">
          <div data-node="environment">
            <SectionTag label="ENVIRONMENT" icon="◉" color="#1D6B5E" />
            <Panel>
              {!agentPlaced && (
                <div className="text-xs text-center py-2 px-2 rounded-lg mb-2" style={{
                  background: "#FFF8E1", border: "1px solid #E8D48A", color: "#8A6D00",
                }}>
                  Agent not placed — default values
                </div>
              )}
              <EnvReadOnlyBar label="Lux" value={environment.lux} min={0} max={2000} color="#D4A017" />
              <EnvReadOnlyBar label="Noise" value={environment.dB} min={0} max={120} suffix="dB" color="#C44040" />
              <EnvReadOnlyBar label="Temp" value={environment.air_temp} min={10} max={35} suffix="°C" color="#1D6B5E" />
              <EnvReadOnlyBar label="RH" value={environment.humidity} min={0} max={100} suffix="%" color="#4A90B8" />
              <EnvReadOnlyBar label="Air V." value={environment.air_velocity} min={0} max={2} suffix="m/s" color="#2E8B6A" />
            </Panel>
          </div>
        </DS>

        {/* ── ROW 2: AVATAR (independent, centered) — HIDDEN ── */}
        <DS k="avatar" className="col-span-12 flex justify-center my-2 md:my-4 hidden">
          <div data-node="avatar">
            <Panel className="flex items-center justify-center" style={{
              minHeight: 240, minWidth: 220,
              background: `linear-gradient(135deg, ${accentColor}10, ${accentColor}05)`,
              border: `2px solid ${accentColor}25`,
            }}>
              <PixelAvatar persona={persona} color={accentColor} size={180} />
            </Panel>
          </div>
        </DS>

        {/* ── ROW 3: PERSONA Info Card (centered, col-span-12) ── */}
        <DS k="persona" className="col-span-12 flex justify-center mb-2 md:mb-4">
          <div data-node="persona" className="flex items-center gap-6 px-8 py-4 rounded-2xl"
            style={{
              background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}08)`,
              border: `2px solid ${accentColor}40`,
              boxShadow: `0 4px 20px ${accentColor}15`,
            }}>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{agent.id}</div>
              <div className="text-sm mt-1" style={{
                color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace",
              }}>
                {agent.age}{agent.gender === "female" ? "F" : "M"} · {agent.mobility} · {agent.mbti}
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                {hasSimulated ? (
                  <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{
                    background: getComfortColor(experience.comfort_score).bg,
                    color: getComfortColor(experience.comfort_score).text,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {experience.comfort_score}/10
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Not simulated</span>
                )}
                <span className="text-xs px-2 py-1.5 rounded-lg" style={{
                  background: "var(--muted)", border: "1px solid var(--border)",
                  color: getTrendInfo(experience.trend).color, fontSize: "10px",
                }}>
                  {getTrendInfo(experience.trend).icon} {getTrendInfo(experience.trend).label}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                {[
                  { label: "Met", value: agent.metabolic_rate.toFixed(1) },
                  { label: "Clo", value: agent.clothing_insulation.toFixed(1) },
                  { label: "Vision", value: agent.vision === "normal" ? "OK" : agent.vision === "mild_impairment" ? "Mild" : "Severe" },
                ].map((item) => (
                  <div key={item.label} className="px-3 py-1.5 text-center rounded-lg" style={{
                    background: "var(--muted)", border: "1px solid var(--border)",
                  }}>
                    <div style={{ color: "var(--muted-foreground)", fontWeight: 600, fontSize: "9px" }}>{item.label}</div>
                    <div style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DS>

        {/* ── ROW 4: ENV. SATISFACTION (col-span-5) ── */}
        <DS k="experience" className="col-span-12 md:col-span-5">
          <div data-node="experience">
            <SectionTag label="ENV. SATISFACTION" icon="◌" color="#1D6B5E" />
            <Panel>
              <p className="text-xs italic mb-2" style={{ color: "var(--foreground)", lineHeight: 1.6, fontSize: "11px" }}>
                "{experience.summary}"
              </p>
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{
                  background: getComfortColor(experience.comfort_score).bg,
                  color: getComfortColor(experience.comfort_score).text,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)", letterSpacing: "0.5px", fontSize: "10px",
                }}>
                  COMFORT {experience.comfort_score}/10
                </span>
                {comfortDelta !== null && Math.abs(comfortDelta) >= 0.1 && (
                  <span className="text-xs font-bold px-2 py-1.5 rounded-lg" style={{
                    background: comfortDelta > 0 ? "#1D6B5E" : "#C44040",
                    color: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", fontSize: "10px",
                  }}>
                    {comfortDelta > 0 ? "+" : ""}{comfortDelta.toFixed(1)} vs prev
                  </span>
                )}
                <span className="text-xs font-semibold px-2 py-1.5 rounded-lg" style={{
                  background: "var(--muted)", color: getTrendInfo(experience.trend).color,
                  border: "1px solid var(--border)", fontSize: "10px",
                }}>
                  {getTrendInfo(experience.trend).icon} {getTrendInfo(experience.trend).label}
                </span>
              </div>

              {prevExperience && prevExperience.comfort_score > 0 && (
                <div className="mt-1 mb-2">
                  <span className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
                    PREV: Comfort {prevExperience.comfort_score} · {prevExperience.trend.toUpperCase()}
                  </span>
                </div>
              )}

              {ruleTriggers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 mb-2">
                  {ruleTriggers.map((t) => (
                    <span key={t} className="sa-tag" style={{ fontSize: "9px" }}>{t}</span>
                  ))}
                </div>
              )}

              <InterventionArrow />
            </Panel>
          </div>
        </DS>

        {/* ── ROW 4: SPATIAL (col-span-3) ── */}
        <DS k="spatial" className="col-span-12 md:col-span-3">
          <div data-node="spatial">
            <SectionTag label="SPATIAL" icon="□" color="#D4A017" />
            <Panel>
              <StaticRow label="→ Wall"
                value={!agentPlaced || spatial.dist_to_wall < 0 ? "—" : spatial.dist_to_wall}
                unit={!agentPlaced || spatial.dist_to_wall < 0 ? undefined : "m"} />
              <StaticRow label="→ Win."
                value={!agentPlaced || spatial.dist_to_window < 0 ? "—" : spatial.dist_to_window}
                unit={!agentPlaced || spatial.dist_to_window < 0 ? undefined : "m"} />
              <StaticRow label="→ Exit"
                value={!agentPlaced || spatial.dist_to_exit < 0 ? "—" : spatial.dist_to_exit}
                unit={!agentPlaced || spatial.dist_to_exit < 0 ? undefined : "m"} />
              <DataRow label="Ceil.">
                <EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" />
              </DataRow>
              <StaticRow label="Encl." value={!agentPlaced ? "—" : spatial.enclosure_ratio} />
              <StaticRow label="Vis.Ag" value={!agentPlaced ? "—" : spatial.visible_agents} />
              <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
                Auto-calculated from map
              </div>
            </Panel>
          </div>
        </DS>

        {/* ── ROW 4: COMPUTED (col-span-4) ── */}
        <DS k="outputs" className="col-span-12 md:col-span-4">
          <div data-node="outputs">
            <SectionTag label="COMPUTED" icon="⊕" color="#1D6B5E" />
            <Panel>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "PMV", value: computedOutputs.PMV, tooltip: "Predicted Mean Vote (ISO 7730)" },
                  { label: "PPD", value: `${computedOutputs.PPD}%`, tooltip: "Predicted Percentage Dissatisfied" },
                  { label: "Eff.Lx", value: computedOutputs.effective_lux, tooltip: "Vision-adjusted illuminance" },
                  { label: "Pr.dB", value: computedOutputs.perceived_dB, tooltip: "Hearing-adjusted noise" },
                ].map((item) => (
                  <div key={item.label} className="p-2 text-center rounded-lg" title={item.tooltip}
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-inset)" }}>
                    <div className="font-semibold" style={{ color: "var(--muted-foreground)", letterSpacing: "0.5px", fontSize: "10px" }}>
                      {item.label}
                    </div>
                    <div className="font-bold mt-0.5" style={{
                      color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "18px",
                    }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <PMVWarnings computedOutputs={computedOutputs} />
              <div className="mt-2 text-xs text-center" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
                PMV/PPD: ISO 7730 Fanger Model
              </div>
              <FormulaModal />
            </Panel>
          </div>
        </DS>

        {/* ── ROW 5: PERCEPTUAL LOAD (col-span-12, two-column bars) ── */}
        <DS k="perceptual" className="col-span-12">
          <div data-node="perceptual">
            <SectionTag label="PERCEPTUAL LOAD" icon="▐" color="#C44040" />
            <Panel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <LoadBar label="Thermal" value={accumulatedState.thermal_discomfort} prevValue={prevAccumulatedState?.thermal_discomfort} />
                <LoadBar label="Visual" value={accumulatedState.visual_strain} prevValue={prevAccumulatedState?.visual_strain} />
                <LoadBar label="Noise" value={accumulatedState.noise_stress} prevValue={prevAccumulatedState?.noise_stress} />
                <LoadBar label="Social" value={accumulatedState.social_overload} prevValue={prevAccumulatedState?.social_overload} />
                <LoadBar label="Fatigue" value={accumulatedState.fatigue} prevValue={prevAccumulatedState?.fatigue} />
                <LoadBar label="Wayfind." value={accumulatedState.wayfinding_anxiety} prevValue={prevAccumulatedState?.wayfinding_anxiety} />
              </div>
            </Panel>
          </div>
        </DS>

      </div>
    </div>
  );
}
