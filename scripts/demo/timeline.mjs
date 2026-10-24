// What the recording does, step by step, in the app (scripts/demo/recordTour.mjs runs it). `d` is the
// director: move(target) eases the real pointer there, click(), hold(ms), type(text), key(name),
// waitFor(js), exists(js), mark(name) (a moment the video lines up with: captions, zooms).
// Targets are { selector, text?, first? } (the last match unless `first`; `text`: it must contain it)
// or { x, y }. exists(selector) and the cards always look at the newest match.
export const QUESTION = '¿Es seguro cómo se guardan los pedidos?';

const card = '#chat .msg.card-msg.tour';
// the newest tour card's part (JS, for waitFor)
const inCard = (part) => `[...document.querySelectorAll('${card}')].at(-1)?.querySelector('${part}')`;

export async function timeline(d) {
  await d.mark('overview');
  await d.hold(1800);

  // The person asks for the tour
  await d.move({ selector: '#chat button', text: 'Recorrido del proyecto' }); // a welcome option or a chip
  await d.hold(350);
  await d.click();
  await d.mark('tourStart');
  await d.waitFor(`!!${inCard('.tour-title')}`, 10000);
  // the agent (Simulador) narrates: wait until its words are on the card
  await d.waitFor(`!/Preparando/.test(${inCard('.card-title span')}?.textContent ?? '')`, 20000);
  await d.mark('step:1');
  await d.hold(3400);

  // Each stop: Siguiente, a pause to read (and the files of a use case, hovered)
  for (let i = 2; i <= 10; i++) {
    if (!(await d.exists(`${card} .card-action.tourNext`))) break;
    await d.move({ selector: `${card} .card-action.tourNext` });
    await d.hold(200);
    await d.click();
    await d.mark(`step:${i}`);
    await d.hold(1400);
    if (await d.exists(`${card} .tour-file`)) {
      await d.move({ selector: `${card} .tour-file`, first: true });
      await d.hold(900);
      await d.move({ selector: `${card} .tour-file` });
      await d.hold(900);
    }
    await d.hold(1800);
  }

  // The last stop: open the README right there, then finish
  await d.mark('start');
  await d.hold(1500);
  if (await d.exists(`${card} .card-action.open`)) {
    await d.move({ selector: `${card} .card-action.open` });
    await d.hold(250);
    await d.click();
    await d.mark('readme');
    await d.hold(2600);
  }
  if (await d.exists(`${card} .card-action.tourExit`)) {
    await d.move({ selector: `${card} .card-action.tourExit` });
    await d.hold(250);
    await d.click();
  }
  await d.mark('tourEnd');
  await d.hold(1200);

  // The agent at work: a question, its steps live, the map reacting
  await d.move({ selector: '#chat-text' });
  await d.click();
  await d.type(QUESTION);
  await d.hold(400);
  await d.move({ selector: '#chat-send' });
  await d.hold(200);
  await d.click();
  await d.mark('ask');
  await d.waitFor(`!!document.querySelector('#chat .msg.run .orb-pill')`, 15000);
  await d.mark('agentWorking');
  await d.waitFor(`![...document.querySelectorAll('#chat .msg.run')].at(-1)?.querySelector('.orb-pill')`, 60000);
  await d.mark('agentDone');
  await d.hold(3500);
  await d.mark('end');
}
