/* Public sim API. Importing this module wires every system onto World. */
export { World } from './world';
export type { WorldOptions } from './world';
import './gazette'; import './character'; import './storyteller'; import './housing'; import './consumer'; import './gear'; import './brand'; import './bank'; import './mortgage'; import './politics'; import './crime2'; import './media'; import './money'; import './lexicon'; import './people'; import './buildings'; import './economy'; import './government'; import './brain';
import './activity'; import './social'; import './crime'; import './viewer'; import './output'; import './persist'; import './tick'; import './helpers';
export { W, H } from '../shared/dims';
export type { View } from './output';
export * from '../shared/constants';
import './thoughts';
