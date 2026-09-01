import { ProposalProvider } from './state/useProposal'
import ProposalGenerator from './ProposalGenerator'

export default function App() {
  return (
    <ProposalProvider>
      <ProposalGenerator />
    </ProposalProvider>
  )
}
