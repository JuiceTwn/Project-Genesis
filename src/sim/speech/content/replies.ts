/* Reply upgrades live next to the topics that use them (see topics-people.ts). Put new ones here when they are about listeners in general. */
import { defineReplyUpgrade } from '../topics';

defineReplyUpgrade('THANKS', { to: 'SMALL', when: 'cool', p: 0.3 });
defineReplyUpgrade('LAUGH', { to: 'SMALL', when: 'cool', p: 0.3 });
