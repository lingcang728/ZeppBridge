import { describe, expect, it } from 'vitest';
import { collapsedFrame, flightFrom, openFrame, staggerOrder, unscaledBox } from '../morph';

describe('card open / close frames', () => {
  it('shrinks the open card onto the source card, clipping the extra height', () => {
    // 源卡 400×250 在 (100, 300)；大卡 1000×1400 在 (50, 120)：缩到 0.4，只露出顶上 625px。
    const frame = collapsedFrame({ left: 100, top: 300, width: 400, height: 250 }, { left: 50, top: 120, width: 1000, height: 1400 }, 34);
    expect(frame.transform).toBe('translate(50px, 180px) scale(0.4)');
    expect(frame.clipPath).toBe('inset(0px 0px 775px 0px round 85px)');
  });
  it('never clips a negative amount when the source is taller than the card', () => {
    const frame = collapsedFrame({ left: 0, top: 0, width: 500, height: 900 }, { left: 0, top: 0, width: 1000, height: 600 }, 20);
    expect(frame.clipPath).toBe('inset(0px 0px 0px 0px round 40px)');
  });
  it('rests at identity with the card radius', () => {
    expect(openFrame(34)).toEqual({ transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 34px)' });
  });
});

describe('unscaledBox', () => {
  it('undoes a centred scale on the receding overview', () => {
    // 容器 1000×600 在 (0,0)，绕中心缩到 0.9：里面 (100,100) 起的 200×100 回到原位。
    const host = { left: 50, top: 30, width: 900, height: 540 };
    const inside = { left: 140, top: 120, width: 180, height: 90 };
    expect(unscaledBox(inside, host, { a: 0.9, e: 0, f: 0 })).toEqual({ left: 100, top: 100, width: 200, height: 100 });
  });
  it('undoes a scale around the top edge', () => {
    // 容器 1000 宽、顶边在 100，绕顶边中点缩到 0.8：顶边不动，横向往中间收。
    const host = { left: 100, top: 100, width: 800, height: 400 };
    const inside = { left: 500, top: 180, width: 160, height: 80 };
    expect(unscaledBox(inside, host, { a: 0.8, e: 0, f: 0 }, { x: 0.5, y: 0 })).toEqual({ left: 500, top: 200, width: 200, height: 100 });
  });
  it('passes boxes through when the host is not transformed', () => {
    const box = { left: 1, top: 2, width: 3, height: 4 };
    expect(unscaledBox(box, box, { a: 1, e: 0, f: 0 })).toBe(box);
  });
});

describe('flightFrom', () => {
  it('starts a list row centred on the coverflow card it came out of', () => {
    const from = { left: 500, top: 300, width: 420, height: 266 };
    const to = { left: 100, top: 200, width: 540, height: 82 };
    const origin = { x: 370, y: 241 };
    const flight = flightFrom(from, to, origin);
    // 等比缩放取较紧的一边：宽度 420/540。
    expect(flight.scale).toBeCloseTo(0.7778, 4);
    const k = flight.scale;
    // 叠加 scale 绕原点，起始中心 = 原点 + 平移 + k ×（终点中心 − 原点）= 旧卡中心。
    expect(origin.x + flight.translate.x + k * (370 - origin.x)).toBeCloseTo(710, 1);
    expect(origin.y + flight.translate.y + k * (241 - origin.y)).toBeCloseTo(433, 1);
  });
  it('compensates for an off-centre transform origin', () => {
    // coverflow 的卡：布局框在舞台中心，transform 把它挪回中间，变换原点在布局框中心。
    const to = { left: 490, top: 367, width: 420, height: 266 };
    const origin = { x: 910, y: 633 };
    const from = { left: 100, top: 100, width: 540, height: 82 };
    const flight = flightFrom(from, to, origin);
    const k = flight.scale;
    expect(origin.x + flight.translate.x + k * (700 - origin.x)).toBeCloseTo(370, 1);
    expect(origin.y + flight.translate.y + k * (500 - origin.y)).toBeCloseTo(141, 1);
  });
});

describe('staggerOrder', () => {
  it('leaves from the centre outwards, wrapping around the deck', () => {
    const order = staggerOrder(['a', 'b', 'c', 'd', 'e'], 'a');
    expect(order.get('a')).toBe(0);
    // b 和 e 都离 a 一格（首尾相接），按原顺序先 b 后 e。
    expect(order.get('b')).toBe(1);
    expect(order.get('e')).toBe(2);
  });
  it('reverses for putting the cards back', () => {
    const order = staggerOrder(['a', 'b', 'c'], 'b', true);
    expect(order.get('b')).toBe(2);
  });
});
