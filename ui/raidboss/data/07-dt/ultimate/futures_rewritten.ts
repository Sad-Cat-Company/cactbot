import Conditions from '../../../../../resources/conditions';
import Outputs from '../../../../../resources/outputs';
import { Responses } from '../../../../../resources/responses';
import {
  DirectionOutput8,
  DirectionOutputCardinal,
  Directions,
} from '../../../../../resources/util';
import ZoneId from '../../../../../resources/zone_id';
import { RaidbossData } from '../../../../../types/data';
import { NetMatches } from '../../../../../types/net_matches';
import { TriggerSet } from '../../../../../types/trigger';

const centerX = 100;
const centerY = 100;

const isCardinalDir = (dir: DirectionOutput8): boolean => {
  return Directions.outputCardinalDir.includes(dir as DirectionOutputCardinal);
};

type RelativeClockPos = 'same' | 'opposite' | 'clockwise' | 'counterclockwise' | 'unknown';
const getRelativeClockPos = (
  start: DirectionOutput8,
  compare: DirectionOutput8,
): RelativeClockPos => {
  if (start === 'unknown' || compare === 'unknown')
    return 'unknown';

  const startIdx = Directions.output8Dir.indexOf(start);
  const compareIdx = Directions.output8Dir.indexOf(compare);
  const delta = (compareIdx - startIdx + 8) % 8;

  if (delta === 0)
    return 'same';
  else if (delta < 4)
    return 'clockwise';
  else if (delta === 4)
    return 'opposite';
  return 'counterclockwise';
};

// Ordering here matters - the "G1" directions are first, followed by "G2" directions.
// Maybe add a config for this? But for now, assume that N->CCW is G1 and NE->CW is G2.
const p2KnockbackDirs: DirectionOutput8[] = [
  'dirN',
  'dirNW',
  'dirW',
  'dirSW',
  'dirS',
  'dirSE',
  'dirE',
  'dirNE',
];

type RelativityDebuff = 'longFire' | 'mediumFire' | 'shortFire' | 'ice';
const newRoleMap = () => ({
  support: {
    hasIce: false,
    shortFire: '',
    mediumFire: '',
    longFire: [] as string[],
  },
  dps: {
    hasIce: false,
    shortFire: [] as string[],
    mediumFire: '',
    longFire: '',
  },
  ice: '',
});

const findNorthDirNum = (dirs: number[]): number => {
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const [dir1, dir2] = [dirs[i], dirs[j]];
      if (dir1 === undefined || dir2 === undefined)
        return -1;
      const diff = Math.abs(dir1 - dir2);
      if (diff === 2)
        return Math.min(dir1, dir2) + 1;
      else if (diff === 6) // wrap around
        return (Math.max(dir1, dir2) + 1) % 8;
    }
  }
  return -1;
};

const p3UROutputStrings = {
  yNorthStrat: {
    en: '${debuff} (${dir})',
  },
  dirCombo: {
    en: '${inOut} + ${dir}',
  },
  fireSpread: {
    en: 'Fire - Spread',
  },
  dropRewind: {
    en: 'Drop Rewind',
  },
  baitStoplight: {
    en: 'Bait Stoplight',
  },
  avoidStoplights: {
    en: 'Avoid stoplights',
  },
  stack: Outputs.stackMarker,
  middle: Outputs.middle,
  out: Outputs.out,
};

export interface Data extends RaidbossData {
  readonly triggerSetConfig: {
    sinboundRotate: 'aacc' | 'addposonly'; // aacc = always away, cursed clockwise
    ultimateRel: 'yNorthDPSEast' | 'none';
  };
  actorSetPosTracker: { [id: string]: NetMatches['ActorSetPos'] };
  p1ConcealSafeDirs: DirectionOutput8[];
  p1StackSpread?: 'stack' | 'spread';
  p1FallOfFaithTethers: ('fire' | 'lightning')[];
  p2QuadrupleFirstTarget: string;
  p2QuadrupleDebuffApplied: boolean;
  p2IcicleImpactStart: DirectionOutput8[];
  p2AxeScytheSafe?: 'in' | 'out';
  p2FrigidStoneTargets: string[];
  p2KBShivaDir?: DirectionOutput8;
  p2LightsteepedCount: number;
  p2LightRampantPuddles: string[];
  p2SeenFirstHolyLight: boolean;
  p3RelativityRoleCount: number;
  p3RelativityDebuff?: RelativityDebuff;
  p3RelativityRoleMap: ReturnType<typeof newRoleMap>;
  p3RelativityStoplights: { [id: string]: NetMatches['AddedCombatant'] };
  p3RelativityYellowDirNums: number[];
  p3RelativityMyDirStr: string;
}

const triggerSet: TriggerSet<Data> = {
  id: 'FuturesRewrittenUltimate',
  zoneId: ZoneId.FuturesRewrittenUltimate,
  config: [
    {
      id: 'sinboundRotate',
      comment: {
        en:
          `Always Away, Cursed Clockwise: <a href="https://pastebin.com/ue7w9jJH" target="_blank">LesBin<a>`,
      },
      name: {
        en: 'P2 Diamond Dust / Sinbound Holy',
      },
      type: 'select',
      options: {
        en: {
          'Always Away, Cursed Clockwise': 'aacc',
          'Call Add Position Only': 'addposonly',
        },
      },
      default: 'aacc', // `addposonly` is not super helpful, and 'aacc' seems to be predominant
    },
    {
      id: 'ultimateRel',
      comment: {
        en:
          `Y North, DPS E-SW, Supp W-NE: <a href="https://pastebin.com/ue7w9jJH" target="_blank">LesBin<a>`,
      },
      name: {
        en: 'P3 Ultimate Relativity',
      },
      type: 'select',
      options: {
        en: {
          'Y North, DPS E-SW, Supp W-NE': 'yNorthDPSEast',
          'Call Debuffs w/ No Positions': 'none',
        },
      },
      default: 'yNorthDPSEast',
    },
  ],
  timelineFile: 'futures_rewritten.txt',
  initData: () => {
    return {
      actorSetPosTracker: {},
      p1ConcealSafeDirs: [...Directions.output8Dir],
      p1FallOfFaithTethers: [],
      p2QuadrupleFirstTarget: '',
      p2QuadrupleDebuffApplied: false,
      p2IcicleImpactStart: [],
      p2FrigidStoneTargets: [],
      p2LightsteepedCount: 0,
      p2LightRampantPuddles: [],
      p2SeenFirstHolyLight: false,
      p3RelativityRoleCount: 0,
      p3RelativityRoleMap: newRoleMap(),
      p3RelativityStoplights: {},
      p3RelativityYellowDirNums: [],
      p3RelativityMyDirStr: '',
    };
  },
  timelineTriggers: [],
  triggers: [
    // General triggers
    {
      id: 'FRU ActorSetPos Collector',
      type: 'ActorSetPos',
      netRegex: { id: '4[0-9A-F]{7}', capture: true },
      run: (data, matches) => {
        data.actorSetPosTracker[matches.id] = matches;
      },
    },
    // P1 -- Fatebreaker
    {
      id: 'FRU P1 Cyclonic Break Fire',
      type: 'StartsUsing',
      netRegex: {
        id: ['9CD0', '9D89'],
        source: ['Fatebreaker', 'Fatebreaker\'s Image'],
        capture: false,
      },
      durationSeconds: 8,
      alertText: (_data, _matches, output) => output.clockPairs!(),
      outputStrings: {
        clockPairs: {
          en: 'Clock spots => Pairs',
          de: 'Himmelsrichtungen => Paare',
          ja: '八方向 => ペア',
          cn: '八方 => 两人分摊',
          ko: '8방향 => 쉐어',
        },
      },
    },
    {
      id: 'FRU P1 Cyclonic Break Lightning',
      type: 'StartsUsing',
      netRegex: {
        id: ['9CD4', '9D8A'],
        source: ['Fatebreaker', 'Fatebreaker\'s Image'],
        capture: false,
      },
      durationSeconds: 8,
      alertText: (_data, _matches, output) => output.clockSpread!(),
      outputStrings: {
        clockSpread: {
          en: 'Clock spots => Spread',
          de: 'Himmelsrichtungen => Verteilen',
          ja: '八方向 => 散開',
          cn: '八方 => 分散',
          ko: '8방향 => 산개',
        },
      },
    },
    {
      id: 'FRU P1 Powder Mark Trail',
      type: 'StartsUsing',
      netRegex: { id: '9CE8', source: 'Fatebreaker', capture: true },
      response: Responses.tankBusterSwap(),
    },
    {
      id: 'FRU P1 Utopian Sky Collector',
      type: 'StartsUsing',
      netRegex: { id: ['9CDA', '9CDB'], capture: true },
      run: (data, matches) => {
        data.p1StackSpread = matches.id === '9CDA' ? 'stack' : 'spread';
      },
    },
    {
      id: 'FRU Conceal Safe',
      type: 'ActorControlExtra',
      netRegex: {
        category: '003F',
        param1: '4',
        capture: true,
      },
      condition: (data) => data.p1StackSpread !== undefined,
      durationSeconds: 8,
      alertText: (data, matches, output) => {
        const clone = data.actorSetPosTracker[matches.id];
        if (clone === undefined)
          return;
        const dir1 = Directions.hdgTo8DirNum(parseFloat(clone.heading));
        const dir2 = (dir1 + 4) % 8;
        data.p1ConcealSafeDirs = data.p1ConcealSafeDirs.filter((dir) =>
          dir !== Directions.outputFrom8DirNum(dir1) && dir !== Directions.outputFrom8DirNum(dir2)
        );

        if (data.p1ConcealSafeDirs.length !== 2)
          return;

        const [dir1Out, dir2Out] = data.p1ConcealSafeDirs;

        if (dir1Out === undefined || dir2Out === undefined)
          return;

        return output.combo!({
          dir1: output[dir1Out]!(),
          dir2: output[dir2Out]!(),
          mech: output[data.p1StackSpread ?? 'unknown']!(),
        });
      },
      outputStrings: {
        ...Directions.outputStrings8Dir,
        combo: {
          en: '${dir1} / ${dir2} => ${mech}',
          de: '${dir1} / ${dir2} => ${mech}',
          ja: '${dir1} / ${dir2} => ${mech}',
          cn: '${dir1} / ${dir2} => ${mech}',
          ko: '${dir1} / ${dir2} => ${mech}',
        },
        stack: Outputs.stacks,
        spread: Outputs.spread,
      },
    },
    {
      id: 'FRU P1 Burnished Glory',
      type: 'StartsUsing',
      netRegex: { id: '9CEA', source: 'Fatebreaker', capture: false },
      response: Responses.bleedAoe(),
    },
    {
      id: 'FRU P1 Burnt Strike Fire',
      type: 'StartsUsing',
      netRegex: { source: 'Fatebreaker', id: '9CC1', capture: false },
      durationSeconds: 8,
      alertText: (_data, _matches, output) => output.text!(),
      outputStrings: {
        text: {
          en: 'Line Cleave => Knockback',
          de: 'Linien AoE => Rückstoß',
          fr: 'AoE en ligne => Poussée',
          ja: '直線範囲 => ノックバック',
          cn: '直线 => 击退',
          ko: '직선 장판 => 넉백',
        },
      },
    },
    {
      id: 'FRU P1 Burnt Strike Lightning',
      type: 'StartsUsing',
      netRegex: { source: 'Fatebreaker', id: '9CC5', capture: false },
      durationSeconds: 8,
      alertText: (_data, _matches, output) => output.text!(),
      outputStrings: {
        text: {
          en: 'Line Cleave => Out',
          de: 'Linien AoE => Raus',
          fr: 'AoE en ligne => Extérieur',
          ja: '直線範囲 => 離れる',
          cn: '直线 => 去外侧',
          ko: '직선 장판 => 바깥으로',
        },
      },
    },
    {
      id: 'FRU P1 Turn of the Heavens Fire',
      type: 'StartsUsing',
      netRegex: { id: '9CD6', source: 'Fatebreaker\'s Image', capture: false },
      durationSeconds: 10,
      infoText: (_data, _matches, output) => output.lightningSafe!(),
      outputStrings: {
        lightningSafe: {
          en: 'Lightning Safe',
          de: 'Blitz Sicher',
          ja: '雷安置',
          cn: '雷安全',
          ko: '번개 안전',
        },
      },
    },
    {
      id: 'FRU P1 Turn of the Heavens Lightning',
      type: 'StartsUsing',
      netRegex: { id: '9CD7', source: 'Fatebreaker\'s Image', capture: false },
      durationSeconds: 10,
      infoText: (_data, _matches, output) => output.fireSafe!(),
      outputStrings: {
        fireSafe: {
          en: 'Fire Safe',
          de: 'Feuer Sicher',
          ja: '炎安置',
          cn: '火安全',
          ko: '불 안전',
        },
      },
    },
    {
      id: 'FRU P1 Fall of Faith Collector',
      type: 'StartsUsing',
      netRegex: {
        id: ['9CC9', '9CCC'],
        source: ['Fatebreaker', 'Fatebreaker\'s Image'],
        capture: true,
      },
      durationSeconds: (data) => data.p1FallOfFaithTethers.length >= 3 ? 8.7 : 3,
      infoText: (data, matches, output) => {
        const curTether = matches.id === '9CC9' ? 'fire' : 'lightning';
        data.p1FallOfFaithTethers.push(curTether);

        if (data.p1FallOfFaithTethers.length < 4) {
          const num = data.p1FallOfFaithTethers.length === 1
            ? 'one'
            : (data.p1FallOfFaithTethers.length === 2 ? 'two' : 'three');
          return output.tether!({
            num: output[num]!(),
            elem: output[curTether]!(),
          });
        }

        const [e1, e2, e3, e4] = data.p1FallOfFaithTethers;

        if (e1 === undefined || e2 === undefined || e3 === undefined || e4 === undefined)
          return;

        return output.all!({
          e1: output[e1]!(),
          e2: output[e2]!(),
          e3: output[e3]!(),
          e4: output[e4]!(),
        });
      },
      outputStrings: {
        fire: {
          en: 'Fire',
          de: 'Feuer',
          ja: '炎',
          cn: '火',
          ko: '불',
        },
        lightning: {
          en: 'Lightning',
          de: 'Blitz',
          ja: '雷',
          cn: '雷',
          ko: '번개',
        },
        one: {
          en: '1',
          de: '1',
          ja: '1',
          cn: '1',
          ko: '1',
        },
        two: {
          en: '2',
          de: '2',
          ja: '2',
          cn: '2',
          ko: '2',
        },
        three: {
          en: '3',
          de: '3',
          ja: '3',
          cn: '3',
          ko: '3',
        },
        tether: {
          en: '${num}: ${elem}',
          de: '${num}: ${elem}',
          ja: '${num}: ${elem}',
          cn: '${num}: ${elem}',
          ko: '${num}: ${elem}',
        },
        all: {
          en: '${e1} => ${e2} => ${e3} => ${e4}',
          de: '${e1} => ${e2} => ${e3} => ${e4}',
          ja: '${e1} => ${e2} => ${e3} => ${e4}',
          cn: '${e1} => ${e2} => ${e3} => ${e4}',
          ko: '${e1} => ${e2} => ${e3} => ${e4}',
        },
      },
    },
    // P2 -- Usurper Of Frost
    {
      id: 'FRU P2 Quadruple Slap First',
      type: 'StartsUsing',
      netRegex: { id: '9CFF', source: 'Usurper of Frost' },
      response: Responses.tankBuster(),
      run: (data, matches) => data.p2QuadrupleFirstTarget = matches.target,
    },
    {
      // Cleansable debuff may be applied with first cast (9CFF)
      // although there are ways to avoid appplication (e.g. Warden's Paean)
      id: 'FRU P2 Quadruple Slap Debuff Gain',
      type: 'GainsEffect',
      netRegex: { effectId: '1042', source: 'Usurper of Frost', capture: false },
      run: (data) => data.p2QuadrupleDebuffApplied = true,
    },
    {
      id: 'FRU P2 Quadruple Slap Debuff Loss',
      type: 'LosesEffect',
      netRegex: { effectId: '1042', source: 'Usurper of Frost', capture: false },
      run: (data) => data.p2QuadrupleDebuffApplied = false,
    },
    {
      id: 'FRU P2 Quadruple Slap Second',
      type: 'StartsUsing',
      // short (2.2s) cast time
      netRegex: { id: '9D00', source: 'Usurper of Frost' },
      response: (data, matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          onYou: Outputs.tankBusterOnYou,
          onTarget: Outputs.tankBusterOnPlayer,
          busterCleanse: {
            en: '${buster} (Cleanse?)',
          },
        };

        const onTarget = output.onTarget!({ player: data.party.member(matches.target) });
        let busterStr: string;

        if (data.me === matches.target)
          busterStr = output.onYou!();
        else if (
          data.p2QuadrupleFirstTarget === matches.target &&
          data.p2QuadrupleDebuffApplied &&
          data.CanCleanse()
        ) {
          busterStr = output.busterCleanse!({ buster: onTarget });
        } else
          busterStr = onTarget;

        if (data.me === matches.target || data.role === 'healer')
          return { alertText: busterStr };
        return { infoText: busterStr };
      },
    },

    {
      id: 'FRU P2 Diamond Dust',
      type: 'StartsUsing',
      netRegex: { id: '9D05', source: 'Usurper of Frost', capture: false },
      response: Responses.bigAoe(),
    },
    {
      id: 'FRU P2 Axe/Scythe Kick Collect',
      type: 'StartsUsing',
      // 9D0A - Axe Kick (be out), 9D0B - Scythe Kick (be in)
      netRegex: { id: ['9D0A', '9D0B'], source: 'Oracle\'s Reflection' },
      condition: (data) => data.p2AxeScytheSafe === undefined, // don't overwrite during Mirror, Mirror
      run: (data, matches) => data.p2AxeScytheSafe = matches.id === '9D0A' ? 'out' : 'in',
    },
    {
      id: 'FRU P2 Icicle Impact Initial Collect',
      type: 'StartsUsing',
      netRegex: { id: '9D06' },
      condition: (data) => data.p2IcicleImpactStart.length < 2,
      run: (data, matches) => {
        const x = parseInt(matches.x);
        const y = parseInt(matches.y);
        const dir = Directions.xyTo8DirOutput(x, y, centerX, centerY);
        data.p2IcicleImpactStart.push(dir);

        // Once we have both, reorder the array and make sure the two dirs are opposites
        if (data.p2IcicleImpactStart.length === 2) {
          data.p2IcicleImpactStart.sort((a, b) =>
            p2KnockbackDirs.indexOf(a) - p2KnockbackDirs.indexOf(b)
          );
          const [dir1 = 'unknown', dir2 = 'unknown'] = data.p2IcicleImpactStart;
          if (getRelativeClockPos(dir1, dir2) !== 'opposite') {
            console.error(`Unexpected Icicle Impact initial dirs: ${dir1}, ${dir2}`);
            data.p2IcicleImpactStart = ['unknown', 'unknown'];
          }
        }
      },
    },
    {
      id: 'FRU P2 House of Light/Frigid Stone',
      type: 'HeadMarker',
      netRegex: { id: '0159' }, // source name can vary due to actor re-use
      alertText: (data, matches, output) => {
        data.p2FrigidStoneTargets.push(matches.target);
        if (data.p2FrigidStoneTargets.length !== 4)
          return;

        const inOut = data.p2AxeScytheSafe ? output[data.p2AxeScytheSafe]!() : output.unknown!();
        const firstIcicle = data.p2IcicleImpactStart[0] ?? 'unknown';

        // Assumes that if first Icicle Impacts spawn on cardinals, House of Light baits will also be
        // cardinals and Frigid Stone puddle drops will be intercards, and vice versa.
        if (data.p2FrigidStoneTargets.includes(data.me)) {
          const dir = firstIcicle === 'unknown'
            ? output.unknown!()
            : (isCardinalDir(firstIcicle) ? output.intercards!() : output.cardinals!());
          return output.dropPuddle!({ inOut: inOut, dir: dir });
        }

        const dir = firstIcicle === 'unknown'
          ? output.unknown!()
          : (isCardinalDir(firstIcicle) ? output.cardinals!() : output.intercards!());
        return output.baitCleave!({ inOut: inOut, dir: dir });
      },
      outputStrings: {
        dropPuddle: {
          en: '${inOut} + Far => Drop Puddle (${dir})',
        },
        baitCleave: {
          en: '${inOut} + Close Bait (${dir})',
        },
        in: Outputs.in,
        out: Outputs.out,
        cardinals: Outputs.cardinals,
        intercards: Outputs.intercards,
        unknown: Outputs.unknown,
      },
    },
    {
      id: 'FRU P2 Heavenly Strike',
      type: 'Ability',
      // use the 'star' (Frigid Stone) drops to fire this alert, as Heavenly Strike has no cast time.
      netRegex: { id: '9D07', capture: false }, // source name can vary due to actor re-use
      durationSeconds: 3.5,
      suppressSeconds: 1,
      alertText: (data, _matches, output) => {
        const [dir1 = 'unknown', dir2 = 'unknown'] = data.p2IcicleImpactStart;
        return output.kbDir!({ kb: output.kb!(), dir1: output[dir1]!(), dir2: output[dir2]!() });
      },
      outputStrings: {
        kbDir: {
          en: '${kb} (${dir1}/${dir2})',
        },
        kb: Outputs.knockback,
        ...Directions.outputStrings8Dir,
        unknown: Outputs.unknown,
      },
    },
    {
      id: 'FRU P2 Shiva Cleave Add Collect',
      type: 'StartsUsing',
      // The Shiva that will cast Twin Silence/Twin Stillness is the same actor
      // that casts Sinbound Holy (9D10).
      netRegex: { id: '9D10' },
      run: (data, matches) => {
        const x = parseFloat(matches.x);
        const y = parseFloat(matches.y);
        data.p2KBShivaDir = Directions.xyTo8DirOutput(x, y, centerX, centerY);
      },
    },
    {
      // TODO: Add 'Always Away, Cursed Clockwise' strat
      id: 'FRU P2 Sinbound Holy Rotation',
      type: 'Ability',
      // We can determine the player's knockbac dir from Heavenly Strike (9D0F).  It occurs after
      // Shiva is already casting Sinbound Holy.
      netRegex: { id: '9D0F' },
      condition: Conditions.targetIsYou(),
      durationSeconds: 5,
      infoText: (data, matches, output) => {
        const x = parseFloat(matches.targetX);
        const y = parseFloat(matches.targetY);
        const playerDir = Directions.xyTo8DirOutput(x, y, centerX, centerY);
        const addDir = data.p2KBShivaDir ?? 'unknown';
        if (playerDir === 'unknown' || addDir === 'unknown')
          return;

        const relPos = getRelativeClockPos(playerDir, addDir);
        if (data.triggerSetConfig.sinboundRotate === 'aacc')
          switch (relPos) {
            case 'same':
            case 'opposite':
              return output.aaccCursed!();
            case 'clockwise':
              return output.aaccRotateCCW!();
            case 'counterclockwise':
              return output.aaccRotateCW!();
            default:
              break;
          }
        return output[relPos]!();
      },
      outputStrings: {
        aaccCursed: {
          en: 'Cursed Add - Fast Clockwise',
        },
        aaccRotateCCW: {
          en: 'Rotate Counterclockwise (away from add)',
        },
        aaccRotateCW: {
          en: 'Rotate Clockwise (away from add)',
        },
        same: {
          en: 'Add is on knockback',
        },
        opposite: {
          en: 'Add is opposite knockback',
        },
        clockwise: {
          en: 'Add is clockwise',
        },
        counterclockwise: {
          en: 'Add is counterclockwise',
        },
      },
    },
    {
      id: 'FRU P2 Shining Armor',
      type: 'GainsEffect',
      netRegex: { effectId: '8E1', capture: false },
      suppressSeconds: 1,
      countdownSeconds: 4.9,
      response: Responses.lookAway('alarm'),
    },
    {
      id: 'FRU P2 Twin Silence/Stillness First',
      type: 'StartsUsing',
      // 9D01 - Twin Stillness (back safe -> front safe)
      // 9D02 - Twin Silence (front safe -> back safe)
      netRegex: { id: ['9D01', '9D02'] },
      durationSeconds: 2.8,
      response: (data, matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          aaccSilence: {
            en: '(stay in front)',
          },
          silence: Outputs.front,
          stillness: Outputs.back,
        };

        if (data.triggerSetConfig.sinboundRotate === 'aacc')
          return matches.id === '9D01'
            ? { alertText: output.stillness!() }
            : { infoText: output.aaccSilence!() };
        return matches.id === '9D01'
          ? { alertText: output.stillness!() }
          : { alertText: output.silence!() };
      },
    },
    {
      id: 'FRU P2 Twin Silence/Stillness Second',
      type: 'StartsUsing',
      // 9D01 - Twin Stillness (back safe -> front safe)
      // 9D02 - Twin Silence (front safe -> back safe)
      netRegex: { id: ['9D01', '9D02'] },
      delaySeconds: 3, // waiting until the Ability line fires is too late, so delay off the 0x14 line.
      alertText: (_data, matches, output) =>
        matches.id === '9D01' ? output.stillness!() : output.silence!(),
      outputStrings: {
        silence: Outputs.back,
        stillness: Outputs.front,
      },
    },
    {
      id: 'FRU P2 Mirror Mirror Initial',
      type: 'StartsUsing',
      netRegex: { id: '9D0B', source: 'Usurper of Frost', capture: false },
      condition: (data) => data.p2AxeScytheSafe !== undefined, // don't fire during DD
      delaySeconds: 1,
      alertText: (_data, _matches, output) => output.baitCleave!(),
      outputStrings: {
        baitCleave: {
          en: 'Bait cleave',
        },
      },
    },
    {
      id: 'FRU P2 Mirror Mirror Reflected',
      type: 'StartsUsing',
      // 9D0D = Reflected Scythe Kick (from Frozen Mirrors)
      netRegex: { id: '9D0D', capture: false },
      delaySeconds: 5, // cast time is 9.7s
      suppressSeconds: 1,
      alertText: (_data, _matches, output) => output.baitCleave!(),
      outputStrings: {
        baitCleave: {
          en: 'Bait cleave',
        },
      },
    },
    {
      // separate trigger for Banish II during LR
      id: 'FRU P2 Mirror Mirror Banish III',
      type: 'StartsUsing',
      // 9D1C - Banish III (partners)
      // 9D1D - Banish III (spread)
      netRegex: { id: ['9D1C', '9D1D'] },
      condition: (data) => data.p2SeenFirstHolyLight === false,
      infoText: (_data, matches, output) =>
        matches.id === '9D1C' ? output.partners!() : output.spread!(),
      outputStrings: {
        partners: Outputs.stackPartner,
        spread: Outputs.spread,
      },
    },
    {
      id: 'FRU P2 Lightsteeped Counter',
      type: 'GainsEffect',
      netRegex: { effectId: '8D1' },
      condition: Conditions.targetIsYou(),
      // can't just increment, since one puddle player gets 2 stacks on initial application
      run: (data, matches) => data.p2LightsteepedCount = parseInt(matches.count),
    },
    {
      id: 'FRU P2 Light Rampant Setup',
      type: 'HeadMarker',
      netRegex: { id: '0177' },
      alertText: (data, matches, output) => {
        data.p2LightRampantPuddles.push(matches.target);
        if (data.p2LightRampantPuddles.length < 2)
          return;

        const p1 = data.party.member(data.p2LightRampantPuddles[0]);
        const p2 = data.party.member(data.p2LightRampantPuddles[1]);
        if (data.me === matches.target)
          return output.puddle!({ other: p1 });
        else if (data.p2LightRampantPuddles[0] === data.me)
          return output.puddle!({ other: p2 });
        return output.tether!({ p1: p1, p2: p2 });
      },
      outputStrings: {
        puddle: {
          en: 'Puddles on you (w/ ${other})',
        },
        tether: {
          en: 'Tether on you (Puddles: ${p1}, ${p2})',
        },
      },
    },
    {
      id: 'FRU P2 Light Rampant Tower',
      type: 'Ability',
      // fire when the second set of Holy Light orbs explode
      netRegex: { id: '9D1B', source: 'Holy Light', capture: false },
      suppressSeconds: 1,
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          towerSoak: {
            en: 'Soak middle tower',
          },
          towerAvoid: {
            en: 'Avoid middle tower',
          },
        };

        if (!data.p2SeenFirstHolyLight)
          return;
        return data.p2LightsteepedCount === 2
          ? { alertText: output.towerSoak!() }
          : { infoText: output.towerAvoid!() };
      },
      run: (data) => data.p2SeenFirstHolyLight = true,
    },
    {
      // separate trigger for Banish II during MM
      id: 'FRU P2 Light Rampant Banish III',
      type: 'StartsUsing',
      // 9D1C - Banish III (partners)
      // 9D1D - Banish III (spread)
      netRegex: { id: ['9D1C', '9D1D'], source: 'Usurper of Frost' },
      condition: (data) => data.p2SeenFirstHolyLight === true,
      delaySeconds: 1,
      alertText: (data, matches, output) => {
        const partnerSpread = matches.id === '9D1C' ? output.partners!() : output.spread!();
        if (data.p2LightsteepedCount === 2)
          return output.afterTower!({ partnerSpread: partnerSpread });
        return partnerSpread;
      },
      outputStrings: {
        afterTower: {
          en: '${partnerSpread} (after tower)',
        },
        partners: Outputs.stackPartner,
        spread: Outputs.spread,
      },
    },
    {
      id: 'FRU P2 The House of Light',
      type: 'StartsUsing',
      netRegex: { id: '9CFD', source: 'Usurper of Frost', capture: false },
      response: Responses.protean(),
    },
    {
      id: 'FRU P2 Absolute Zero',
      type: 'StartsUsing',
      netRegex: { id: '9D20', source: 'Usurper of Frost', capture: false },
      delaySeconds: 4,
      response: Responses.bigAoe(),
    },
    // Crystals
    {
      id: 'FRU Intermission Junction',
      type: 'WasDefeated',
      netRegex: { target: 'Ice Veil', capture: false },
      delaySeconds: 5,
      response: Responses.bigAoe(),
    },
    // P3 -- Oracle Of Darkness
    {
      id: 'FRU P3 Ultimate Relativity AoE',
      type: 'StartsUsing',
      netRegex: { id: '9D4A', source: 'Oracle of Darkness', capture: false },
      delaySeconds: 4, // cast time is 9.7s
      response: Responses.bigAoe(),
    },
    {
      id: 'FRU P3 Ultimate Relativity Debuff Collect',
      type: 'GainsEffect',
      // 997 = Spell-in-Waiting: Dark Fire III (11s, 21s, or 31s)
      // 99E = Spell-in-Waiting: Dark Blizzard III (21s)
      netRegex: { effectId: ['997', '99E'] },
      run: (data, matches) => {
        data.p3RelativityRoleCount++;

        const dur = parseFloat(matches.duration);
        let debuff: RelativityDebuff;
        if (matches.effectId === '99E')
          debuff = 'ice';
        else if (dur < 12)
          debuff = 'shortFire';
        else if (dur < 22)
          debuff = 'mediumFire';
        else
          debuff = 'longFire';

        const rawRole = data.party.member(matches.target).role;
        let role: 'dps' | 'support';
        if (rawRole === 'tank' || rawRole === 'healer')
          role = 'support';
        else if (rawRole === 'dps')
          role = 'dps';
        else
          return;

        if (debuff === 'ice') {
          data.p3RelativityRoleMap[role].hasIce = true;
          data.p3RelativityRoleMap.ice = matches.target;
        } else if (role === 'dps' && debuff === 'shortFire')
          data.p3RelativityRoleMap.dps.shortFire.push(matches.target);
        else if (role === 'support' && debuff === 'longFire')
          data.p3RelativityRoleMap.support.longFire.push(matches.target);
        else
          data.p3RelativityRoleMap[role][debuff] = matches.target;

        if (data.me === matches.target)
          data.p3RelativityDebuff = debuff;
      },
    },
    {
      id: 'FRU P3 Ultimate Relativity Initial Debuff',
      type: 'GainsEffect',
      netRegex: { effectId: ['997', '99E'], capture: false },
      condition: (data) => data.p3RelativityRoleCount === 8,
      durationSeconds: 8,
      infoText: (data, _matches, output) => {
        const role = data.role === 'dps' ? 'dps' : 'support';
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (debuff === 'ice')
          return output.debuffSolo!({ debuff: output.ice!() });
        else if (debuff === 'mediumFire')
          return output.debuffSolo!({ debuff: output.mediumFire!() });
        else if (debuff === 'longFire') {
          if (role === 'dps')
            return output.debuffSolo!({ debuff: output.longFire!() });
          const other = data.p3RelativityRoleMap.support.longFire.find((e) => e !== data.me);
          return output.debuffShared!({
            debuff: output.longFire!(),
            other: data.party.member(other),
          });
        }
        if (role === 'support')
          return output.debuffSolo!({ debuff: output.shortFire!() });
        const other = data.p3RelativityRoleMap.dps.shortFire.find((e) => e !== data.me);
        return output.debuffShared!({
          debuff: output.shortFire!(),
          other: data.party.member(other),
        });
      },
      outputStrings: {
        debuffSolo: {
          en: '${debuff} on you',
        },
        debuffShared: {
          en: '${debuff} on you (w/ ${other})',
        },
        shortFire: {
          en: 'Short Fire',
        },
        mediumFire: {
          en: 'Medium Fire',
        },
        longFire: {
          en: 'Long Fire',
        },
        ice: {
          en: 'Ice',
        },
      },
    },
    {
      id: 'FRU P3 Ultimate Relativity Stoplight Collect',
      type: 'AddedCombatant',
      netRegex: { npcBaseId: '17832' },
      run: (data, matches) => data.p3RelativityStoplights[matches.id] = matches,
    },
    {
      id: 'FRU P3 Ultimate Relativity Y North Spot',
      type: 'Tether',
      // boss tethers to 5 stoplights - 0085 are purple tethers, 0086 are yellow
      netRegex: { id: '0086' },
      // condition: (data) => data.triggerSetConfig.ultimateRel === 'yNorthDPSEast',
      run: (data, matches, output) => {
        const id = matches.sourceId;
        const stoplight = data.p3RelativityStoplights[id];
        if (stoplight === undefined)
          return;

        const x = parseFloat(stoplight.x);
        const y = parseFloat(stoplight.y);
        data.p3RelativityYellowDirNums.push(Directions.xyTo8DirNum(x, y, centerX, centerY));

        if (data.p3RelativityYellowDirNums.length !== 3)
          return;

        const northDirNum = findNorthDirNum(data.p3RelativityYellowDirNums);
        if (northDirNum === -1 || data.p3RelativityDebuff === undefined) {
          data.p3RelativityMyDirStr = output.unknown!();
          return;
        }

        const role = data.role === 'dps' ? 'dps' : 'support';
        const debuff = data.p3RelativityDebuff;

        if (role === 'dps') {
          if (debuff === 'longFire' || debuff === 'ice') {
            const myDirNum = (northDirNum + 4) % 8; // relative South
            data.p3RelativityMyDirStr = output[Directions.output8Dir[myDirNum] ?? 'unknown']!();
          } else if (debuff === 'mediumFire') {
            const myDirNum = (northDirNum + 2) % 8; // relative East
            data.p3RelativityMyDirStr = output[Directions.output8Dir[myDirNum] ?? 'unknown']!();
          } else if (debuff === 'shortFire') {
            const dirs = [ // relative SE/SW
              Directions.output8Dir[(northDirNum + 3) % 8] ?? 'unknown',
              Directions.output8Dir[(northDirNum + 5) % 8] ?? 'unknown',
            ];
            data.p3RelativityMyDirStr = dirs.map((dir) => output[dir]!()).join(output.or!());
          }
        } else { // supports
          if (debuff === 'shortFire' || debuff === 'ice') {
            const myDirNum = northDirNum; // relative North
            data.p3RelativityMyDirStr = output[Directions.output8Dir[myDirNum] ?? 'unknown']!();
          } else if (debuff === 'mediumFire') {
            const myDirNum = (northDirNum + 6) % 8; // relative West
            data.p3RelativityMyDirStr = output[Directions.output8Dir[myDirNum] ?? 'unknown']!();
          } else if (debuff === 'longFire') {
            const dirs = [ // relative NE/NW
              Directions.output8Dir[(northDirNum + 1) % 8] ?? 'unknown',
              Directions.output8Dir[(northDirNum + 7) % 8] ?? 'unknown',
            ];
            data.p3RelativityMyDirStr = dirs.map((dir) => output[dir]!()).join(output.or!());
          }
        }
      },
      outputStrings: {
        ...Directions.outputStrings8Dir,
        or: Outputs.or,
        unknown: Outputs.unknown,
      },
    },
    // There are six steps to the mechanic. A player's action at each step is determined by their
    // debuff combo (which is deterministic based on the initial fire/ice debuff).
    // Since every player receives a 9A0 debuff ('Spell-in-Waiting: Return) of varying lengths,
    // fire each of these triggers based on a delay from when 9A0 is applied at the start of UR.
    {
      id: 'FRU P3 Ultimate Rel 1st Fire/Stack',
      type: 'GainsEffect',
      netRegex: { effectId: '9A0' },
      condition: Conditions.targetIsYou(),
      delaySeconds: 4,
      durationSeconds: 7,
      alertText: (data, _matches, output) => {
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (data.triggerSetConfig.ultimateRel !== 'yNorthDPSEast')
          return output[debuff]!();

        const dirStr = data.p3RelativityMyDirStr;
        if (debuff !== 'shortFire')
          return output.yNorthStrat!({ debuff: output[debuff]!(), dir: output.middle!() });
        return output.yNorthStrat!({ debuff: output.shortFire!(), dir: dirStr });
      },
      outputStrings: {
        yNorthStrat: p3UROutputStrings.yNorthStrat,
        shortFire: p3UROutputStrings.fireSpread,
        mediumFire: p3UROutputStrings.stack,
        longFire: p3UROutputStrings.stack,
        ice: p3UROutputStrings.stack,
        middle: p3UROutputStrings.middle,
      },
    },
    {
      id: 'FRU P3 Ultimate Rel 1st Bait/Rewind',
      type: 'GainsEffect',
      netRegex: { effectId: '9A0' },
      condition: Conditions.targetIsYou(),
      delaySeconds: 11,
      alertText: (data, _matches, output) => {
        const role = data.role === 'dps' ? 'dps' : 'support';
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (data.triggerSetConfig.ultimateRel !== 'yNorthDPSEast')
          return output[debuff]!();

        const dirStr = data.p3RelativityMyDirStr;

        if (debuff === 'longFire')
          return output.yNorthStrat!({ debuff: output.longFire!(), dir: dirStr });
        else if (debuff === 'ice') {
          // dps ice bait stoplights; support ice drops rewind (eruption - out)
          const comboDirStr = role === 'dps'
            ? dirStr
            : output.dirCombo!({ inOut: output.out!(), dir: dirStr });
          return role === 'dps'
            ? output.yNorthStrat!({ debuff: output.iceDps!(), dir: comboDirStr })
            : output.yNorthStrat!({ debuff: output.iceSupport!(), dir: comboDirStr });
        } else if (debuff === 'mediumFire') {
          // dps mediumFire drops rewind (dark water - stack mid); support mediumFire drops rewind (eruption - out)
          const comboDirStr = role === 'dps'
            ? output.dirCombo!({ inOut: output.middle!(), dir: dirStr })
            : output.dirCombo!({ inOut: output.out!(), dir: dirStr });
          return output.yNorthStrat!({ debuff: output.mediumFire!(), dir: comboDirStr });
        }
        // shortFires all drop rewinds (eruption - out)
        const comboDirStr = output.dirCombo!({ inOut: output.out!(), dir: dirStr });
        return output.yNorthStrat!({ debuff: output.shortFire!(), dir: comboDirStr });
      },
      outputStrings: {
        yNorthStrat: p3UROutputStrings.yNorthStrat,
        dirCombo: p3UROutputStrings.dirCombo,
        shortFire: p3UROutputStrings.dropRewind,
        mediumFire: p3UROutputStrings.dropRewind,
        longFire: p3UROutputStrings.baitStoplight,
        iceDps: p3UROutputStrings.baitStoplight,
        iceSupport: p3UROutputStrings.dropRewind,
        middle: p3UROutputStrings.middle,
        out: p3UROutputStrings.out,
      },
    },
    {
      id: 'FRU P3 Ultimate Rel 2nd Fire/Stack + Ice',
      type: 'GainsEffect',
      netRegex: { effectId: '9A0' },
      condition: Conditions.targetIsYou(),
      delaySeconds: 16,
      alertText: (data, _matches, output) => {
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (data.triggerSetConfig.ultimateRel !== 'yNorthDPSEast')
          return output[debuff]!();

        const dirStr = data.p3RelativityMyDirStr;
        if (debuff !== 'mediumFire')
          return output.yNorthStrat!({ debuff: output[debuff]!(), dir: output.middle!() });
        return output.yNorthStrat!({ debuff: output.mediumFire!(), dir: dirStr });
      },
      outputStrings: {
        yNorthStrat: p3UROutputStrings.yNorthStrat,
        shortFire: p3UROutputStrings.stack,
        mediumFire: p3UROutputStrings.fireSpread,
        longFire: p3UROutputStrings.stack,
        ice: p3UROutputStrings.stack,
        middle: p3UROutputStrings.middle,
      },
    },
    {
      id: 'FRU P3 Ultimate Rel 2nd Bait/Rewind',
      type: 'GainsEffect',
      netRegex: { effectId: '9A0' },
      condition: Conditions.targetIsYou(),
      delaySeconds: 21,
      alertText: (data, _matches, output) => {
        const role = data.role === 'dps' ? 'dps' : 'support';
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (data.triggerSetConfig.ultimateRel !== 'yNorthDPSEast')
          return output[debuff]!();

        const dirStr = data.p3RelativityMyDirStr;

        if (debuff === 'shortFire')
          return output.yNorthStrat!({ debuff: output.shortFire!(), dir: dirStr });
        else if (debuff === 'ice') {
          // dps ice baits drops rewind (gaze - in); support ice baits stoplight
          const comboDirStr = role === 'support'
            ? dirStr
            : output.dirCombo!({ inOut: output.middle!(), dir: data.p3RelativityMyDirStr });
          return role === 'dps'
            ? output.yNorthStrat!({ debuff: output.iceDps!(), dir: comboDirStr })
            : output.yNorthStrat!({ debuff: output.iceSupport!(), dir: comboDirStr });
        } else if (debuff === 'mediumFire') {
          // mediumFires have nothing to do, but they'll be stacking mid next
          return output.yNorthStrat!({ debuff: output.mediumFire!(), dir: output.middle!() });
        }
        // longFires all drop rewinds (gaze - in)
        const comboDirStr = output.dirCombo!({ inOut: output.middle!(), dir: dirStr });
        return output.yNorthStrat!({ debuff: output.longFire!(), dir: comboDirStr });
      },
      outputStrings: {
        yNorthStrat: p3UROutputStrings.yNorthStrat,
        dirCombo: p3UROutputStrings.dirCombo,
        shortFire: p3UROutputStrings.baitStoplight,
        mediumFire: p3UROutputStrings.avoidStoplights,
        longFire: p3UROutputStrings.dropRewind,
        iceDps: p3UROutputStrings.dropRewind,
        iceSupport: p3UROutputStrings.baitStoplight,
        middle: p3UROutputStrings.middle,
        out: p3UROutputStrings.out,
      },
    },
    {
      id: 'FRU P3 Ultimate Rel 3rd Fire/Stack',
      type: 'GainsEffect',
      netRegex: { effectId: '9A0' },
      condition: Conditions.targetIsYou(),
      delaySeconds: 26,
      alertText: (data, _matches, output) => {
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (data.triggerSetConfig.ultimateRel !== 'yNorthDPSEast')
          return output[debuff]!();

        const dirStr = data.p3RelativityMyDirStr;
        if (debuff !== 'longFire')
          return output.yNorthStrat!({ debuff: output[debuff]!(), dir: output.middle!() });
        return output.yNorthStrat!({ debuff: output.longFire!(), dir: dirStr });
      },
      outputStrings: {
        yNorthStrat: p3UROutputStrings.yNorthStrat,
        shortFire: p3UROutputStrings.stack,
        mediumFire: p3UROutputStrings.stack,
        longFire: p3UROutputStrings.fireSpread,
        ice: p3UROutputStrings.stack,
        middle: p3UROutputStrings.middle,
      },
    },
    {
      id: 'FRU P3 Ultimate Rel 3nd Bait/Rewind',
      type: 'GainsEffect',
      netRegex: { effectId: '9A0' },
      condition: Conditions.targetIsYou(),
      delaySeconds: 31,
      alertText: (data, _matches, output) => {
        const debuff = data.p3RelativityDebuff;
        if (debuff === undefined)
          return;

        if (data.triggerSetConfig.ultimateRel !== 'yNorthDPSEast')
          return output[debuff]!();

        const dirStr = data.p3RelativityMyDirStr;

        if (debuff !== 'mediumFire')
          return output.yNorthStrat!({ debuff: output[debuff]!(), dir: output.middle!() });
        return output.yNorthStrat!({ debuff: output.mediumFire!(), dir: dirStr });
      },
      outputStrings: {
        yNorthStrat: p3UROutputStrings.yNorthStrat,
        shortFire: p3UROutputStrings.avoidStoplights,
        mediumFire: p3UROutputStrings.baitStoplight,
        longFire: p3UROutputStrings.avoidStoplights,
        ice: p3UROutputStrings.avoidStoplights,
        middle: p3UROutputStrings.middle,
        out: p3UROutputStrings.out,
      },
    },
    {
      id: 'FRU P3 Ultimate Rel Look Out',
      type: 'GainsEffect',
      // 99B - Rewind triggered
      netRegex: { effectId: '99B' },
      condition: Conditions.targetIsYou(),
      delaySeconds: (_data, matches) => parseFloat(matches.duration) - 4,
      countdownSeconds: (_data, matches) => parseFloat(matches.duration),
      response: Responses.lookAway('alarm'),
    },
    // P4 -- Duo

    // P5 -- Pandora
  ],
  timelineReplace: [
    {
      'locale': 'en',
      'replaceText': {
        'Sinbound Fire III/Sinbound Thunder III': 'Sinbound Fire/Thunder',
      },
    },
    {
      'missingTranslations': true,
      'locale': 'de',
      'replaceSync': {
        'Fatebreaker(?!\')': 'fusioniert(?:e|er|es|en) Ascian',
        'Fatebreaker\'s Image': 'Abbild des fusionierten Ascians',
        'Usurper of Frost': 'Shiva-Mitron',
        'Oracle\'s Reflection': 'Spiegelbild des Orakels',
      },
      'replaceText': {
        'Blastburn': 'Brandstoß',
        'Blasting Zone': 'Erda-Detonation',
        'Burn Mark': 'Brandmal',
        'Burnished Glory': 'Leuchtende Aureole',
        'Burnout': 'Brandentladung',
        'Burnt Strike': 'Brandschlag',
        'Cyclonic Break': 'Zyklon-Brecher',
        'Explosion': 'Explosion',
        'Fall Of Faith': 'Sünden-Erdspaltung',
        'Floating Fetters': 'Schwebende Fesseln',
        'Powder Mark Trail': 'Stetes Pulvermal',
        'Sinblaze': 'Sündenglut',
        'Sinbound Fire III': 'Sünden-Feuga',
        'Sinbound Thunder III': 'Sünden-Blitzga',
        'Sinsmite': 'Sündenblitz',
        'Sinsmoke': 'Sündenflamme',
        'Turn Of The Heavens': 'Kreislauf der Wiedergeburt',
        'Utopian Sky': 'Paradiestrennung',
      },
    },
    {
      'missingTranslations': true,
      'locale': 'fr',
      'replaceSync': {
        'Fatebreaker(?!\')': 'Sabreur de destins',
        'Fatebreaker\'s Image': 'double du Sabreur de destins',
        'Usurper of Frost': 'Shiva-Mitron',
        'Oracle\'s Reflection': 'reflet de la prêtresse',
      },
      'replaceText': {
        'Blastburn': 'Explosion brûlante',
        'Blasting Zone': 'Zone de destruction',
        'Burn Mark': 'Marque explosive',
        'Burnished Glory': 'Halo luminescent',
        'Burnout': 'Combustion totale',
        'Burnt Strike': 'Frappe brûlante',
        'Cyclonic Break': 'Brisement cyclonique',
        'Explosion': 'Explosion',
        'Fall Of Faith': 'Section illuminée',
        'Floating Fetters': 'Entraves flottantes',
        'Powder Mark Trail': 'Marquage fatal enchaîné',
        'Sinblaze': 'Embrasement authentique',
        'Sinbound Fire III': 'Méga Feu authentique',
        'Sinbound Thunder III': 'Méga Foudre authentique',
        'Sinsmite': 'Éclair du péché',
        'Sinsmoke': 'Flammes du péché',
        'Turn Of The Heavens': 'Cercles rituels',
        'Utopian Sky': 'Ultime paradis',
      },
    },
    {
      'missingTranslations': true,
      'locale': 'ja',
      'replaceSync': {
        'Fatebreaker(?!\')': 'フェイトブレイカー',
        'Fatebreaker\'s Image': 'フェイトブレイカーの幻影',
        'Usurper of Frost': 'シヴァ・ミトロン',
        'Oracle\'s Reflection': '巫女の鏡像',
      },
      'replaceText': {
        'Blastburn': 'バーンブラスト',
        'Blasting Zone': 'ブラスティングゾーン',
        'Burn Mark': '爆印',
        'Burnished Glory': '光焔光背',
        'Burnout': 'バーンアウト',
        'Burnt Strike': 'バーンストライク',
        'Cyclonic Break': 'サイクロニックブレイク',
        'Explosion': '爆発',
        'Fall Of Faith': 'シンソイルセヴァー',
        'Floating Fetters': '浮遊拘束',
        'Powder Mark Trail': '連鎖爆印刻',
        'Sinblaze': 'シンブレイズ',
        'Sinbound Fire III': 'シンファイガ',
        'Sinbound Thunder III': 'シンサンダガ',
        'Sinsmite': 'シンボルト',
        'Sinsmoke': 'シンフレイム',
        'Turn Of The Heavens': '転輪召',
        'Utopian Sky': '楽園絶技',
      },
    },
  ],
};

export default triggerSet;
