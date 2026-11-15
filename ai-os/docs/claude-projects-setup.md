# Setting up the two Claude Projects

The system in this folder runs through the Claude API. Claude Projects are for **people**: a place to think, draft and ask questions with a business's knowledge loaded. Set up one Project per business and never mix them.

## Why two Projects, never one
A Project's knowledge and instructions are available to every chat inside it. One Project per business is what keeps one company's clients, finances and unpublished work out of the other's context.

## Steps (repeat once per business)
1. In Claude, create a Project named exactly for the business: **Garden Route Lifestyle Property — AI Workforce** or **Feral Femme — AI Workforce**.
2. **Project instructions:** paste the `constitution` lines from that business's `tenant.json`, then:
   > You are the orchestrator for this business. The agent registry and instruction files are in the project knowledge. When I give you work, say which agent owns it, follow that agent's instruction file, and stop for my approval before anything that would reach a client, the public or money. Use only the project knowledge for business facts; if something is missing, say so.
3. **Project knowledge:** upload, from that business's folder only:
   - everything under `knowledge/`
   - `registry/agents.csv`
   - the `registry/instructions/` files for the agents you will use most (all of them if space allows)
   - `docs/05-workflows.md` and `docs/marketing-team.md`
   - GRLP only: the Brand Kit PDF
4. **Connectors:** enable only that business's accounts. If one Claude account serves both businesses, check before every session which mailbox, drive and calendar are connected — a connector does not know which business a chat is about. Separate Claude accounts, or a team workspace with separate Projects and separately connected accounts, remove that risk.
5. **Test the separation:** in each Project ask, "What do you know about [the other business]?" The answer should be that it has no information.

## API workspaces
In the Anthropic Console create two workspaces, one per business, each with its own API key and its own monthly spend limit. Give each key only to its own system (`GRLP_ANTHROPIC_API_KEY`, `FF_ANTHROPIC_API_KEY`).

## How the Project and the system work together
| Use the Claude Project for | Use the command centre for |
|---|---|
| Thinking through a strategy, a difficult reply, a framing question | Anything that must be tracked, approved and logged |
| One-off drafts and rewrites | Repeatable workflows |
| Asking questions of the knowledge base in conversation | Daily, weekly and monthly reports |

A draft made in a Project still goes through the command centre's approval before it is sent or published.
