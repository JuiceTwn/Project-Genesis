/* Must be imported before ./main so the client starts in local-sim mode. */
import * as Sim from '../sim';
(window as any).Sim = Sim;
(window as any).__LOCAL__ = true;
