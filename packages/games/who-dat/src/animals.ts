/** The pool every board is drawn from. Ids are stable; they're what the server stores. */
export interface Animal {
  id: string;
  name: string;
  emoji: string;
}

export const ANIMALS: readonly Animal[] = [
  { id: 'cat', name: 'Cat', emoji: '🐱' },
  { id: 'dog', name: 'Dog', emoji: '🐶' },
  { id: 'mouse', name: 'Mouse', emoji: '🐭' },
  { id: 'hamster', name: 'Hamster', emoji: '🐹' },
  { id: 'rabbit', name: 'Rabbit', emoji: '🐰' },
  { id: 'fox', name: 'Fox', emoji: '🦊' },
  { id: 'bear', name: 'Bear', emoji: '🐻' },
  { id: 'panda', name: 'Panda', emoji: '🐼' },
  { id: 'koala', name: 'Koala', emoji: '🐨' },
  { id: 'tiger', name: 'Tiger', emoji: '🐯' },
  { id: 'lion', name: 'Lion', emoji: '🦁' },
  { id: 'cow', name: 'Cow', emoji: '🐮' },
  { id: 'pig', name: 'Pig', emoji: '🐷' },
  { id: 'frog', name: 'Frog', emoji: '🐸' },
  { id: 'monkey', name: 'Monkey', emoji: '🐵' },
  { id: 'chicken', name: 'Chicken', emoji: '🐔' },
  { id: 'penguin', name: 'Penguin', emoji: '🐧' },
  { id: 'duck', name: 'Duck', emoji: '🦆' },
  { id: 'eagle', name: 'Eagle', emoji: '🦅' },
  { id: 'owl', name: 'Owl', emoji: '🦉' },
  { id: 'bat', name: 'Bat', emoji: '🦇' },
  { id: 'wolf', name: 'Wolf', emoji: '🐺' },
  { id: 'horse', name: 'Horse', emoji: '🐴' },
  { id: 'bee', name: 'Bee', emoji: '🐝' },
  { id: 'ladybug', name: 'Ladybug', emoji: '🐞' },
  { id: 'turtle', name: 'Turtle', emoji: '🐢' },
  { id: 'snake', name: 'Snake', emoji: '🐍' },
  { id: 'octopus', name: 'Octopus', emoji: '🐙' },
  { id: 'crab', name: 'Crab', emoji: '🦀' },
  { id: 'dolphin', name: 'Dolphin', emoji: '🐬' },
  { id: 'whale', name: 'Whale', emoji: '🐳' },
  { id: 'shark', name: 'Shark', emoji: '🦈' },
  { id: 'elephant', name: 'Elephant', emoji: '🐘' },
  { id: 'giraffe', name: 'Giraffe', emoji: '🦒' },
  { id: 'zebra', name: 'Zebra', emoji: '🦓' },
  { id: 'hedgehog', name: 'Hedgehog', emoji: '🦔' },
  { id: 'raccoon', name: 'Raccoon', emoji: '🦝' },
  { id: 'sloth', name: 'Sloth', emoji: '🦥' },
  { id: 'otter', name: 'Otter', emoji: '🦦' },
  { id: 'kangaroo', name: 'Kangaroo', emoji: '🦘' },
  { id: 'flamingo', name: 'Flamingo', emoji: '🦩' },
  { id: 'parrot', name: 'Parrot', emoji: '🦜' },
  { id: 'camel', name: 'Camel', emoji: '🐫' },
  { id: 'hippo', name: 'Hippo', emoji: '🦛' },
  { id: 'gorilla', name: 'Gorilla', emoji: '🦍' },
  { id: 'sheep', name: 'Sheep', emoji: '🐑' },
  { id: 'snail', name: 'Snail', emoji: '🐌' },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋' },
  { id: 'crocodile', name: 'Crocodile', emoji: '🐊' },
  { id: 'seal', name: 'Seal', emoji: '🦭' },
  { id: 'skunk', name: 'Skunk', emoji: '🦨' },
  { id: 'peacock', name: 'Peacock', emoji: '🦚' },
];

const byId = new Map(ANIMALS.map((a) => [a.id, a]));
export const animal = (id: string): Animal | undefined => byId.get(id);
