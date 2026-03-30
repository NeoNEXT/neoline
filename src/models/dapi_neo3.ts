export { requestTargetN3 } from '../../cross-runtime/neo3-shared';

export enum AuthType {
  None = 'None',
  CalledByEntry = 'CalledByEntry',
  CustomContracts = 'CustomContracts',
  CustomGroups = 'CustomGroups',
  Global = 'Global',
  WitnessRules = 'WitnessRules',
}
