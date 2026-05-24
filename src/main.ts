import { Session } from "./state/session";
import { render, renderOnChange } from "./ui/render";

const session = new Session();

renderOnChange(session);
render(session);
