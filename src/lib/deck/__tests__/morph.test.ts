import { describe, expect, it } from 'vitest';
import { flightFrom, staggerOrder } from '../morph';

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
