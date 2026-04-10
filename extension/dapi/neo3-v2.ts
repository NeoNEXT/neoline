import EventEmitter from 'events';
import { ERRORS as LEGACY_ERRORS, EVENT } from '../common/data_module_neo2';
import { requestTargetN3, EVENT as EVENT_N3 } from '../common/data_module_neo3';
import {
  Account,
  Address,
  ApplicationLog,
  Argument,
  AuthenticationChallengePayload,
  AuthenticationResponsePayload,
  Base64Encoded,
  Block,
  ContractParametersContext,
  NEP21ErrorCode,
  NEP21Error,
  EventNameEnum,
  TransactionOptions,
  Integer,
  InvocationArguments,
  InvocationResult,
  Network,
  NetworkEnum,
  SignedMessage,
  Signer,
  SignOptions,
  Token,
  Transaction,
  UInt160,
  UInt256,
} from '../common/data_module_neo3_v2';
import { checkNeoXConnectAndLogin, sendMessage } from './common';
import { N3MainnetNetwork, N3TestnetNetwork } from '../common/constants';
import {
  handleNeo3StackNumberValue,
  handleNeo3StackStringValue,
} from '../common';
import { sc, tx, u, wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import BigNumber from 'bignumber.js';
import { hex2base64 } from '@cityofzion/neon-core-neo3/lib/u';
import { TransactionAttributeJson } from '@cityofzion/neon-core-neo3/lib/tx';

type LegacyAccount = {
  address: string;
  label?: string;
};

type LegacyInvokeResult = {
  txid: string;
  signedTx?: string;
};

class NEOLineN3Controller extends EventEmitter {
  name = 'NeoLine';
  version = '1.0';
  dapiVersion = '1.0';
  compatibility = ['NEP-11', 'NEP-17', 'NEP-21'];
  connected = false;
  network: Network = NetworkEnum.MAINNET;
  supportedNetworks: Network[] = [NetworkEnum.MAINNET, NetworkEnum.TESTNET];
  icon =
    'data:image/svg+xml;charset=utf-8;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBmaWxsPSJub25lIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgdmlld0JveD0iMCAwIDYwIDYwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgeDE9IjAuMzAxMDc0MTc3MDI2NzQ4NjYiIHkxPSIxLjA0NjU4NDI0ODU0Mjc4NTYiIHgyPSIwLjY5ODkyNTY3Mzk2MTYzOTQiIHkyPSItMC4wNDY1NDUyNDEwMjgwNzA0NSIgaWQ9Im1hc3Rlcl9zdmcwXzEzN18wMDkyNSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzhERDlEMiIgc3RvcC1vcGFjaXR5PSIxIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDZDQ0FCIiBzdG9wLW9wYWNpdHk9IjEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Zz48Zz48cGF0aCBkPSJNNjAsMTIuNjI5OUw2MCw0Ny4zNzAxQzYwLjAwMjQsNDkuMzIyMSw1OS41NTA1LDUxLjI0NzksNTguNjc5OSw1Mi45OTUxQzU4LjY0MTgsNTMuMDcyNCw1OC42MDE5LDUzLjE0OTIsNTguNTYyNyw1My4yMjUzQzU2LjM4NDgsNTcuMzg4MSw1Mi4wNzMxLDU5Ljk5Nyw0Ny4zNzEzLDU5Ljk5N0wxMi42Mjk5LDU5Ljk5N0M1LjY1Mzk5LDYwLjAwMTIsLTAuMDAyNTkwMTgsNTQuMzQ1OSwwLDQ3LjM3MDFMMCwxMi42Mjk5QzAsNS42NTQyOSw1LjY1NDMsMCwxMi42Mjk5LDBMNDcuMzcwMSwwQzU0LjM0NTcsMCw2MCw1LjY1NDI5LDYwLDEyLjYyOTlaIiBmaWxsPSJ1cmwoI21hc3Rlcl9zdmcwXzEzN18wMDkyNSkiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48cGF0aCBkPSIiIGZpbGw9IiMwMDAwMDAiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48cGF0aCBkPSIiIGZpbGw9IiMwMDAwMDAiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48Zz48cGF0aCBkPSJNMTEuOTQwMjIyNzQwMTczMzQsMTYuODk2NjIwMzU2MTQwMTM2TDExLjk0MDIyMjc0MDE3MzM0LDQzLjUyOTIxMDM1NjE0MDEzTDI5LjI1MTEyMjc0MDE3MzM0LDQ5Ljg1NDQxMDM1NjE0MDEzNkwyOS4yNTExMjI3NDAxNzMzNCwyMi44ODkwMTAzNTYxNDAxMzdMNDguMDU5NzIyNzQwMTczMzQsMTUuODk4MTkwMzU2MTQwMTM3TDMwLjkxNTIyMjc0MDE3MzM0LDkuOTA1ODEwMzU2MTQwMTM3TDExLjk0MDIyMjc0MDE3MzM0LDE2Ljg5NjYyMDM1NjE0MDEzNloiIGZpbGw9IiNGRkZGRkYiIGZpbGwtb3BhY2l0eT0iMC4yMDAwMDAwMDI5ODAyMzIyNCIvPjwvZz48Zz48cGF0aCBkPSJNMzAuNTgyNDM4NDY4OTMzMTA1LDIzLjg4NzQ0NzMzNDEzNjk2NUwzMC41ODI0Mzg0Njg5MzMxMDUsMzguMjAyNDU3MzM0MTM2OTY2TDQ4LjA1OTczODQ2ODkzMzEwNSw0NC41Mjc2NTczMzQxMzY5Nkw0OC4wNTk3Mzg0Njg5MzMxMDUsMTcuMzk1ODU3MzM0MTM2OTYzTDMwLjU4MjQzODQ2ODkzMzEwNSwyMy44ODc0NDczMzQxMzY5NjVaIiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjAuMjAwMDAwMDAyOTgwMjMyMjQiLz48L2c+PC9nPjxnPjxwYXRoIGQ9Ik0zOC4yMDMwNTg5MTcyMzYzMjYsMzguODkwMzM3MDc4ODU3NDJDMzcuNDgyMDU4OTE3MjM2MzMsMzguODkwMzM3MDc4ODU3NDIsMzYuODk3NTU4OTE3MjM2MzI0LDM4LjMwNTgzNzA3ODg1NzQyLDM2Ljg5NzU1ODkxNzIzNjMyNCwzNy41ODQ4MzcwNzg4NTc0MkwzNi44OTc1NTg5MTcyMzYzMjQsMzAuNjYyNjA3MDc4ODU3NDIzQzM2Ljg5NjA1ODkxNzIzNjMzLDI4LjQ5MjI4NzA3ODg1NzQyMywzNS4xMzYyNTg5MTcyMzYzMjYsMjYuNzMzNjg3MDc4ODU3NDIsMzIuOTY1OTM4OTE3MjM2MzMsMjYuNzMzNjg3MDc4ODU3NDJDMzAuNzk1NjA4OTE3MjM2MzMsMjYuNzMzNjg3MDc4ODU3NDIsMjkuMDM1Nzg4OTE3MjM2MzI4LDI4LjQ5MjI4NzA3ODg1NzQyMywyOS4wMzQyOTg5MTcyMzYzMjcsMzAuNjYyNjA3MDc4ODU3NDIzTDI5LjAzNDI5ODkxNzIzNjMyNywzNy41ODQ4MzcwNzg4NTc0MkMyOS4wMzQyOTg5MTcyMzYzMjcsMzguMzA1ODM3MDc4ODU3NDIsMjguNDQ5ODE4OTE3MjM2MzMsMzguODkwMzM3MDc4ODU3NDIsMjcuNzI4ODI4OTE3MjM2MzI4LDM4Ljg5MDMzNzA3ODg1NzQyQzI3LjAwNzgzNjkxNzIzNjMzLDM4Ljg5MDMzNzA3ODg1NzQyLDI2LjQyMzM1ODkxNzIzNjMyOCwzOC4zMDU4MzcwNzg4NTc0MiwyNi40MjMzNTg5MTcyMzYzMjgsMzcuNTg0ODM3MDc4ODU3NDJMMjYuNDIzMzU4OTE3MjM2MzI4LDMwLjY2MjYwNzA3ODg1NzQyM0MyNi40MjMzNTcxMjkwOTYzMjgsMjcuMDQ5MjQ3MDc4ODU3NDIzLDI5LjM1MjU2ODkxNzIzNjMzLDI0LjEyMDAzNzA3ODg1NzQyMiwzMi45NjU5Mzg5MTcyMzYzMywyNC4xMjAwMzcwNzg4NTc0MjJDMzYuNTc5MjU4OTE3MjM2MzMsMjQuMTIwMDM3MDc4ODU3NDIyLDM5LjUwODU1ODkxNzIzNjMzLDI3LjA0OTI0NzA3ODg1NzQyMywzOS41MDg1NTg5MTcyMzYzMywzMC42NjI2MDcwNzg4NTc0MjNMMzkuNTA4NTU4OTE3MjM2MzMsMzcuNTg0ODM3MDc4ODU3NDJDMzkuNTA4NTU4OTE3MjM2MzMsMzguMzA1ODM3MDc4ODU3NDIsMzguOTI0MDU4OTE3MjM2MzMsMzguODkwMzM3MDc4ODU3NDIsMzguMjAzMDU4OTE3MjM2MzI2LDM4Ljg5MDMzNzA3ODg1NzQyWiIgZmlsbD0iI0ZGRkZGRiIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjxnPjxwYXRoIGQ9Ik01Ni4xNTk5MTE0NDQwOTE4LDMxLjUwNTE5MTMzOTExMTMyN0M1Ni4xNTk0MTE0NDQwOTE3OTUsMjYuNTYzNzYxMzM5MTExMzI3LDUxLjQ3MTgxMTQ0NDA5MTgsMjIuOTY3NjExMzM5MTExMzMsNDYuNjk4OTAxNDQ0MDkxNzk2LDI0LjI0Njk4MTMzOTExMTMzQzQxLjkyNTk1MTQ0NDA5MTc5NCwyNS41MjYzNjEzMzkxMTEzMywzOS42NjU1MDE0NDQwOTE3OTUsMzAuOTg0ODkxMzM5MTExMzMsNDIuMTM2NTcxNDQ0MDkxOCwzNS4yNjQwOTEzMzkxMTEzM0M0NC42MDc2NDE0NDQwOTE4LDM5LjU0MzI5MTMzOTExMTMzLDUwLjQ2NTIyMTQ0NDA5MTc5Niw0MC4zMTM5OTEzMzkxMTEzMjUsNTMuOTU5MTExNDQ0MDkxNzk2LDM2LjgxOTU5MTMzOTExMTMzQzU0LjQ1NTUxMTQ0NDA5MTgsMzYuMzA3NTkxMzM5MTExMzI2LDU0LjQ0OTIxMTQ0NDA5MTc5NCwzNS40OTE4OTEzMzkxMTEzMjYsNTMuOTQ0ODExNDQ0MDkxOCwzNC45ODc2OTEzMzkxMTEzM0M1My40NDA0MTE0NDQwOTE3OTQsMzQuNDgzMzkxMzM5MTExMzMsNTIuNjI0NzExNDQ0MDkxOCwzNC40NzcyOTEzMzkxMTEzMyw1Mi4xMTI4MTE0NDQwOTE4LDM0Ljk3Mzg5MTMzOTExMTMyNkM0OS45NDIzMTE0NDQwOTE4LDM3LjE0MjY5MTMzOTExMTMzLDQ2LjMzNTY5MTQ0NDA5MTc5LDM2LjgwNzU5MTMzOTExMTMyNiw0NC42MDE5MDE0NDQwOTE3OTQsMzQuMjc2MDkxMzM5MTExMzNDNDIuODY4MTExNDQ0MDkxNzk1LDMxLjc0NDYwMTMzOTExMTMyNyw0My44NTkwOTE0NDQwOTE3OTYsMjguMjYwNjQxMzM5MTExMzI3LDQ2LjY2NTYzMTQ0NDA5MTc5NCwyNy4wMjA2MjEzMzkxMTEzM0M0OS40NzIxODE0NDQwOTE3OTUsMjUuNzgwNTkxMzM5MTExMzMsNTIuNzE1MjExNDQ0MDkxNzksMjcuMzkzODExMzM5MTExMzI3LDUzLjQxOTQxMTQ0NDA5MTc5LDMwLjM4MDE5MTMzOTExMTMyN0w1MC4zNzI1NzE0NDQwOTE4LDMwLjM4MDE5MTMzOTExMTMyN0M0OS42NzYxNDE0NDQwOTE4LDMwLjM2NTA3MTMzOTExMTMyOCw0OS4xMDM0MzE0NDQwOTE4LDMwLjkyNTQ5MTMzOTExMTMzLDQ5LjEwMzQzMTQ0NDA5MTgsMzEuNjIyMDgxMzM5MTExMzNDNDkuMTAzNDMxNDQ0MDkxOCwzMi4zMTg2ODEzMzkxMTEzMyw0OS42NzYxNDE0NDQwOTE4LDMyLjg3OTEwMTMzOTExMTMzLDUwLjM3MjU3MTQ0NDA5MTgsMzIuODYzOTgxMzM5MTExMzNMNTQuODM4MDExNDQ0MDkxOCwzMi44NjM5ODEzMzkxMTEzM0M1NS4yMTMxMTE0NDQwOTE3OTQsMzIuODYzOTIxMzM5MTExMzMsNTUuNTY4MTExNDQ0MDkxOCwzMi42OTQxOTEzMzkxMTEzMyw1NS44MDM2MTE0NDQwOTE4LDMyLjQwMjI2MTMzOTExMTMzQzU2LjAzMzExMTQ0NDA5MTc5NCwzMi4xNjAwNjEzMzkxMTEzMyw1Ni4xNjA3MTE0NDQwOTE3OTUsMzEuODM4ODYxMzM5MTExMzMsNTYuMTU5OTExNDQ0MDkxOCwzMS41MDUxOTEzMzkxMTEzMjdaIiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PGc+PHBhdGggZD0iTTE4LjU2NjQ1OTIzNzY3MDg5OCwzOC44OTk3MDI0MDE3MzM0TDEyLjQ4MzI1OTIzNzY3MDg5OCwzOC44OTk3MDI0MDE3MzM0QzkuMjM1MzE5MjM3NjcwODk5LDM4Ljg5NTkwMjQwMTczMzM5NSw2LjYwMzQxMDAzNzY3MDg5OSwzNi4yNjM3MDI0MDE3MzM0LDYuNTk5ODU5MjM3NjcwODk4LDMzLjAxNTgwMjQwMTczMzM5Nkw2LjU5OTg1OTIzNzY3MDg5OCwxNi43ODk0MjI0MDE3MzMzOTdDNi42MTQ5MDI4Mzc2NzA4OTksMTYuMDc5MzYyNDAxNzMzNCw3LjE5NDgyMTIzNzY3MDg5OCwxNS41MTE2MDI0MDE3MzMzOTgsNy45MDUwMzkyMzc2NzA4OTg0LDE1LjUxMTYwMjQwMTczMzM5OEM4LjYxNTI0OTIzNzY3MDg5OCwxNS41MTE2MDI0MDE3MzMzOTgsOS4xOTUxNjkyMzc2NzA4OTgsMTYuMDc5MzYyNDAxNzMzNCw5LjIxMDIwOTIzNzY3MDg5OSwxNi43ODk0MjI0MDE3MzMzOTdMOS4yMTAyMDkyMzc2NzA4OTksMzMuMDE1ODAyNDAxNzMzMzk2QzkuMjEyMTQ5MjM3NjcwODk4LDM0LjgyMjYwMjQwMTczMzQsMTAuNjc2NDA5MjM3NjcwOSwzNi4yODY5MDI0MDE3MzM0LDEyLjQ4MzI1OTIzNzY3MDg5OCwzNi4yODg4MDI0MDE3MzM0TDE4LjU2NjQ1OTIzNzY3MDg5OCwzNi4yODg4MDI0MDE3MzM0QzIwLjM3MzI1OTIzNzY3MDksMzYuMjg2OTAyNDAxNzMzNCwyMS44Mzc1NTkyMzc2NzA5LDM0LjgyMjYwMjQwMTczMzQsMjEuODM5NDU5MjM3NjcwODk4LDMzLjAxNTgwMjQwMTczMzM5NkwyMS44Mzk0NTkyMzc2NzA4OTgsMjUuNDY0MjEyNDAxNzMzNEMyMS44Mzk0NTkyMzc2NzA4OTgsMjQuNzQzMjIyNDAxNzMzMzk4LDIyLjQyMzk1OTIzNzY3MDksMjQuMTU4NzQyNDAxNzMzNCwyMy4xNDQ5NTkyMzc2NzA5LDI0LjE1ODc0MjQwMTczMzRDMjMuODY1OTU5MjM3NjcwOSwyNC4xNTg3NDI0MDE3MzM0LDI0LjQ1MDQ1OTIzNzY3MDksMjQuNzQzMjIyNDAxNzMzMzk4LDI0LjQ1MDQ1OTIzNzY3MDksMjUuNDY0MjEyNDAxNzMzNEwyNC40NTA0NTkyMzc2NzA5LDMzLjAxNTgwMjQwMTczMzM5NkMyNC40NDY1NTkyMzc2NzA4OTcsMzYuMjYzODAyNDAxNzMzNCwyMS44MTQ0NTkyMzc2NzA5LDM4Ljg5NTkwMjQwMTczMzM5NSwxOC41NjY0NTkyMzc2NzA4OTgsMzguODk5NzAyNDAxNzMzNFoiIGZpbGw9IiNGRkZGRkYiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09Im1hdHJpeCgwLjcwNzEwNjc2OTA4NDkzMDQsMC43MDcxMDY3NjkwODQ5MzA0LC0wLjcwNzEwNjc2OTA4NDkzMDQsMC43MDcxMDY3NjkwODQ5MzA0LDE5LjE4NTk1ODY5ODAwOTAxNywtMTEuMjUzNjM2MjAwNjQ2OTUyKSI+PHJlY3QgeD0iMjMuMTc3MzIwNDgwMzQ2NjgiIHk9IjE3LjUzMjY4MjQxODgyMzI0MiIgd2lkdGg9IjMuOTE1ODE4MjE0NDE2NTA0IiBoZWlnaHQ9IjMuOTE1ODE4MjE0NDE2NTA0IiByeD0iMS45NTc5MDkxMDcyMDgyNTIiIGZpbGw9IiNGRkZGRkYiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48cGF0aCBkPSJNNTguNjc5NzU1MTQ5NDU5ODQsNTEuOTYwMzQ3OTg3MDYwNTQ0TDU4LjY3OTc1NTE0OTQ1OTg0LDUyLjk5ODA0Nzk4NzA2MDU0NUM1OC42NDE2NTUxNDk0NTk4NCw1My4wNzUzODc5ODcwNjA1NDUsNTguNjAxODU1MTQ5NDU5ODQsNTMuMTUyMTQ3OTg3MDYwNTQ1LDU4LjU2MjU1NTE0OTQ1OTg0LDUzLjIyODMxNzk4NzA2MDU1QzU2LjM4NDY1NTE0OTQ1OTg0LDU3LjM5MTA2Nzk4NzA2MDU0NSw1Mi4wNzI5NTUxNDk0NTk4NCw1OS45OTk5Njc5ODcwNjA1NCw0Ny4zNzExNTUxNDk0NTk4NCw1OS45OTk5Njc5ODcwNjA1NEwxMi42Mjk3NTUxNDk0NTk4NCw1OS45OTk5Njc5ODcwNjA1NEM4LjY0NzA0NTE0OTQ1OTgzOSw2MC4wMDMwNjc5ODcwNjA1NSw0Ljg5Njg3NTE0OTQ1OTgzOSw1OC4xMjQ3Njc5ODcwNjA1NSwyLjUxNDE1NTE0OTQ1OTgzOSw1NC45MzMzOTc5ODcwNjA1NDVDMy4xMTU5MTMxNDk0NTk4MzksNTMuNDc2NzU3OTg3MDYwNTQ1LDQuMjc5NTg1MTQ5NDU5ODM5LDUyLjM1NTI3Nzk4NzA2MDU0Niw1Ljk0NTQwNTE0OTQ1OTgzOSw1MS43NjkzMzc5ODcwNjA1NDVDNi41Njc5NzUxNDk0NTk4MzksNTEuNTU0OTg3OTg3MDYwNTUsNy4yMTQzMzUxNDk0NTk4Mzg0LDUxLjQxNzI1Nzk4NzA2MDU0NSw3Ljg3MDIwNTE0OTQ1OTgzOSw1MS4zNTkxODc5ODcwNjA1NDRMNTEuODI4NDU1MTQ5NDU5ODQsNDUuOTUyNzQyNzg3MDYwNTQ0QzU0LjE0OTg1NTE0OTQ1OTg0LDQ1LjY2NTA0ODk4NzA2MDU0NCw1Ni40NTczNTUxNDk0NTk4MzYsNDYuNzA1MDg2OTg3MDYwNTUsNTcuNzE4MjU1MTQ5NDU5ODM2LDQ4LjY3MzgzNzk4NzA2MDU0NEM1OC4zNDczNTUxNDk0NTk4NCw0OS42NTQ0Mzc5ODcwNjA1NSw1OC42ODExNTUxNDk0NTk4NCw1MC43OTUyOTc5ODcwNjA1NSw1OC42Nzk3NTUxNDk0NTk4NCw1MS45NjAzNDc5ODcwNjA1NDRaIiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PGc+PHBhdGggZD0iTTU4LjU2Mjc5MzEwMzQwODgxNSw1My4yMjgyNTE4NTA1ODU5MzRDNTYuMzg0MTkzMTAzNDA4ODEsNTcuMzkxMDcxODUwNTg1OTQsNTIuMDcyNTkzMTAzNDA4ODEsNTkuOTk5OTMxODUwNTg1OTQsNDcuMzcxMzkzMTAzNDA4ODEsNTkuOTk5OTMxODUwNTg1OTRMMTIuNjI5OTkzMTAzNDA4ODEzLDU5Ljk5OTkzMTg1MDU4NTk0QzguMDgwMzQzMTAzNDA4ODEzLDU5Ljk5NTUzMTg1MDU4NTkzNCwzLjg4MzE3MzEwMzQwODgxMzMsNTcuNTQ5NTMxODUwNTg1OTM2LDEuNjM2NTkzMTAzNDA4ODEzNSw1My41OTMyOTE4NTA1ODU5MzVDMi40MTg2NjcxMDM0MDg4MTM2LDUyLjQ1MTcxNzg1MDU4NTkzNiwzLjcxMzYxMzEwMzQwODgxMzYsNTEuNzY5Mjc5MDAzMTM1OTM1LDUuMDk3NzIzMTAzNDA4ODEzLDUxLjc2OTI3NTQyNjg1NTkzNEw1NS4zNzk5OTMxMDM0MDg4MTUsNTEuNzY5Mjc1NDI2ODU1OTM0QzU2LjYwMjk5MzEwMzQwODgxNCw1MS43Njc4NjI4MDA1ODU5NCw1Ny43NjU1OTMxMDM0MDg4MSw1Mi4zMDA3ODg4NTA1ODU5NCw1OC41NjI3OTMxMDM0MDg4MTUsNTMuMjI4MjUxODUwNTg1OTM0WiIgZmlsbD0iI0NFRjVFRCIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjwvZz48L3N2Zz4=';
  website = 'https://neoline.io/';
  extra = null;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  async authenticate(
    payload: AuthenticationChallengePayload,
  ): Promise<AuthenticationResponsePayload> {
    assertAuthenticationPayload(payload);
    if (!payload.allowed_algorithms.includes('ECDSA-P256')) {
      throw {
        code: NEP21ErrorCode.UNSUPPORTED,
        message: 'Unsupported algorithm. Only ECDSA-P256 is supported.',
      };
    }

    return this.sendAuthorizedMessage<AuthenticationResponsePayload>(
      requestTargetN3.Authenticate,
      payload,
    );
  }

  async getAccounts(): Promise<Account[]> {
    return this.sendAuthorizedMessage<Account[]>(requestTargetN3.Accounts);
  }

  async pickAddress(prompt?: string): Promise<Address> {
    const result = await sendMessage<string | LegacyAccount>(
      requestTargetN3.PickAddress,
      {
        prompt,
        hostname: location.hostname,
      },
    ).catch((error) => {
      throw normalizeError(error);
    });

    return typeof result === 'string' ? result : result.address;
  }

  async getBalance(asset: UInt160, account: UInt160): Promise<Integer> {
    if (
      !asset ||
      !account ||
      !wallet3.isScriptHash(asset) ||
      !wallet3.isScriptHash(account)
    ) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'asset' and 'account' must be valid script hashes`,
      };
    }

    const result = await this.call({
      hash: asset,
      operation: 'balanceOf',
      args: [{ type: 'Hash160', value: account }],
    });

    return handleNeo3StackNumberValue(result);
  }

  async send(
    asset: UInt160,
    from: UInt160,
    to: UInt160,
    amount: Integer,
    data?: Argument,
  ): Promise<UInt256> {
    if (!asset || !from || !to || !amount) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'asset', 'from', 'to' and 'amount' must be provided`,
      };
    }

    if (!isValidIntegerAmount(amount)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'amount' must be a positive integer in string format`,
      };
    }
    if (!wallet3.isScriptHash(asset)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'asset' must be a valid script hash`,
      };
    }
    if (!wallet3.isScriptHash(from)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'from' must be a valid script hash`,
      };
    }
    if (!wallet3.isScriptHash(to)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'to' must be a valid script hash`,
      };
    }

    if (data) {
      try {
        sc.ContractParam.fromJson(data);
      } catch (error) {
        throw {
          code: NEP21ErrorCode.INVALID,
          message: `'data' must be a valid contract parameter`,
          data: error
        };
      }
    }

    const toAddress = await wallet3.getAddressFromScriptHash(
      stripHexPrefix(to),
    );
    const fromAddress = await wallet3.getAddressFromScriptHash(
      stripHexPrefix(from),
    );
    const result = await this.sendAuthorizedMessage<LegacyInvokeResult>(
      requestTargetN3.Send,
      {
        fromAddress,
        toAddress,
        asset,
        amount,
        data,
        version: 2,
      },
    );

    return result.txid;
  }

  async call(invocation: InvocationArguments): Promise<InvocationResult> {
    assertInvocation(invocation);
    return await sendMessage<any>(requestTargetN3.InvokeRead, {
      scriptHash: invocation.hash,
      operation: invocation.operation,
      args: invocation.args || [],
      signers: [],
    }).catch((error) => {
      throw normalizeError(error);
    });
  }

  async invoke(
    invocations: InvocationArguments[],
    signers?: Signer[],
    attributes?: TransactionAttributeJson[],
    options?: TransactionOptions,
  ): Promise<UInt256> {
    const { target, parameter } = await this.toInvokeRequest(
      invocations,
      signers,
      attributes,
      options,
      false,
    );
    const result = await this.sendAuthorizedMessage<LegacyInvokeResult>(
      target,
      parameter,
    );

    return result.txid;
  }

  async makeTransaction(
    invocations: InvocationArguments[],
    signers?: Signer[],
    attributes?: TransactionAttributeJson[],
    options?: TransactionOptions,
  ): Promise<ContractParametersContext> {
    const parameter = await this.toCreateTransactionRequest(
      invocations,
      signers,
      attributes,
      options,
    );
    const unsignedTx = await sendMessage<string>(
      requestTargetN3.CreateTransaction,
      parameter,
    ).catch((error) => {
      throw normalizeError(error);
    });

    if (!unsignedTx) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `Failed to create transaction`,
      };
    }

    const accounts = await sendMessage<Account[]>(
      requestTargetN3.Accounts,
    ).catch(() => []);

    // 优先使用当前已打开账户里的 contract script；当前 provider 无法识别的 signer 先保留空 script，后续由对应钱包在 sign(context) 时补齐。
    // Prefer the contract script from the currently opened account; leave the script empty for signers the current provider cannot resolve yet, and let the corresponding wallet fill it in during sign(context).
    return buildContractParametersContext(unsignedTx, this.network, {
      accounts,
    });
  }

  async sign(
    context: ContractParametersContext,
  ): Promise<ContractParametersContext> {
    if (
      !context?.data ||
      context.type !== 'Neo.Network.P2P.Payloads.Transaction'
    ) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `Invalid context data or type. Expected a transaction context with type 'Neo.Network.P2P.Payloads.Transaction'.`,
      };
    }

    return this.sendAuthorizedMessage<ContractParametersContext>(
      requestTargetN3.SignTransaction,
      {
        context,
        hostname: location.hostname,
      },
    );
  }

  async signMessage(
    message: string | Base64Encoded,
    account?: UInt160,
    options?: SignOptions,
  ): Promise<SignedMessage> {
    if (!message) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'message' is required`,
      };
    }
    if (account && !wallet3.isScriptHash(account)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'account' must be a valid script hash`,
      };
    }

    if (options?.isTypedData) {
      throw {
        code: NEP21ErrorCode.UNSUPPORTED,
        message: 'Typed data is not supported',
      };
    }

    const newOptions = {
      isBase64Encoded: options?.isBase64Encoded ?? false,
      isLedgerCompatible: options?.isLedgerCompatible ?? false,
      isTypedData: options?.isTypedData ?? false,
    };

    if (newOptions.isLedgerCompatible) {
      let hexMessage: string;
      if (newOptions.isBase64Encoded) {
        hexMessage = u.base642hex(message);
      } else {
        hexMessage = u.str2hexstring(message);
      }
      try {
        tx.Transaction.deserialize(hexMessage);
      } catch (error) {
        throw {
          code: NEP21ErrorCode.INVALID,
          message:
            "Invalid 'message' for ledger-compatible signing. When 'options.isLedgerCompatible' is true, provide a serialized Neo3 transaction (set 'options.isBase64Encoded' to match the message format).",
        }
      }
    }

    return this.sendAuthorizedMessage<SignedMessage>(
      requestTargetN3.SignMessageV3,
      {
        message,
        account,
        options: newOptions,
      },
    );
  }

  async relay(context: ContractParametersContext): Promise<UInt256> {
    if (!context?.data) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'context.data' is required`,
      };
    }

    const result = await sendMessage<any>(requestTargetN3.Relay, {
      data: context.data,
    }).catch((error) => {
      throw normalizeError(error);
    });

    if (typeof result === 'string') {
      return result;
    }
    if (result?.hash) {
      return result.hash;
    }

    return context.hash;
  }

  async getBlock(hashOrIndex: UInt256 | number): Promise<Block> {
    if (hashOrIndex === undefined || hashOrIndex === null) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `block index or hash is required`,
      };
    }

    if (typeof hashOrIndex !== 'number' && typeof hashOrIndex !== 'string') {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `block index or hash must be a number or string`,
      };
    }

    if (typeof hashOrIndex === 'string' && !isUint256(hashOrIndex)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `block hash must be a valid uint256`,
      };
    }

    return sendMessage<Block>(requestTargetN3.Block, {
      blockHeight: String(hashOrIndex),
    }).catch((error) => {
      throw normalizeError(error);
    });
  }

  async getBlockCount(): Promise<number> {
    return sendMessage<number>(requestTargetN3.BlockCount).catch((error) => {
      throw normalizeError(error);
    });
  }

  async getTransaction(txid: UInt256): Promise<Transaction> {
    if (!txid || !isUint256(txid)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'txid' must be a valid uint256`,
      };
    }

    return await sendMessage<any>(requestTargetN3.Transaction, {
      txid,
    }).catch((error) => {
      throw normalizeError(error);
    });
  }

  async getApplicationLog(txid: UInt256): Promise<ApplicationLog> {
    if (!txid || !isUint256(txid)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'txid' must be a valid uint256`,
      };
    }

    return sendMessage<ApplicationLog>(requestTargetN3.ApplicationLog, {
      txid,
    }).catch((error) => {
      throw normalizeError(error);
    });
  }

  async getStorage(hash: UInt160, key: Base64Encoded): Promise<Base64Encoded> {
    if (!hash || key === undefined || !wallet3.isScriptHash(hash)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'hash' must be a valid script hash`,
      };
    }

    return await sendMessage<{ result: Base64Encoded }>(requestTargetN3.Storage, {
      scriptHash: hash,
      key,
      keyEncoding: 'base64',
    }).catch((error) => {
      throw normalizeError(error);
    }).then((response) => response.result);
  }

  async getTokenInfo(hash: UInt160): Promise<Token> {
    if (!hash || !wallet3.isScriptHash(hash)) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'hash' must be a valid script hash`,
      };
    }

    const [symbol, decimals, totalSupply] = await Promise.all([
      this.call({
        hash,
        operation: 'symbol',
      }),
      this.call({
        hash,
        operation: 'decimals',
      }),
      this.call({
        hash,
        operation: 'totalSupply',
      }),
    ]);

    return {
      symbol: handleNeo3StackStringValue(symbol),
      decimals: Number(handleNeo3StackNumberValue(decimals)),
      totalSupply: handleNeo3StackNumberValue(totalSupply),
    };
  }

  private async toInvokeRequest(
    invocations: InvocationArguments[],
    signers?: Signer[],
    attributes?: TransactionAttributeJson[],
    options?: TransactionOptions,
    broadcastOverride?: boolean,
  ) {
    if (!Array.isArray(invocations) || invocations.length === 0) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'invocations' must be a non-empty array`,
      };
    }

    assertSupportedTransactionOptions(attributes, options);

    invocations.forEach(assertInvocation);
    const extraSystemFee = options?.extraSystemFee
      ? new BigNumber(options.extraSystemFee).shiftedBy(-8).toFixed()
      : undefined;
    const suggestedSystemFee = options?.suggestedSystemFee
      ? new BigNumber(options.suggestedSystemFee).shiftedBy(-8).toFixed()
      : undefined;

    if (invocations.length === 1) {
      const [invocation] = invocations;
      return {
        target: requestTargetN3.Invoke,
        parameter: {
          scriptHash: invocation.hash,
          operation: invocation.operation,
          args: invocation.args || [],
          abortOnFail: invocation.abortOnFail,
          signers: signers || [],
          attributes: attributes || [],
          extraSystemFee: extraSystemFee,
          overrideSystemFee: suggestedSystemFee,
          validUntilBlock: options?.validUntilBlock,
          broadcastOverride,
          hostname: location.hostname,
        },
      };
    }

    return {
      target: requestTargetN3.InvokeMultiple,
      parameter: {
        invokeArgs: invocations.map((item) => ({
          scriptHash: item.hash,
          operation: item.operation,
          args: item.args || [],
          abortOnFail: item.abortOnFail,
        })),
        signers: signers || [],
        attributes: attributes || [],
        extraSystemFee: extraSystemFee,
        overrideSystemFee: suggestedSystemFee,
        validUntilBlock: options?.validUntilBlock,
        broadcastOverride,
        hostname: location.hostname,
      },
    };
  }

  private async toCreateTransactionRequest(
    invocations: InvocationArguments[],
    signers?: Signer[],
    attributes?: TransactionAttributeJson[],
    options?: TransactionOptions,
  ) {
    if (!Array.isArray(invocations) || invocations.length === 0) {
      throw {
        code: NEP21ErrorCode.INVALID,
        message: `'invocations' must be a non-empty array`,
      };
    }

    assertSupportedTransactionOptions(attributes, options);

    invocations.forEach(assertInvocation);

    return {
      invokeArgs: invocations.map((item) => ({
        scriptHash: item.hash,
        operation: item.operation,
        args: item.args || [],
        abortOnFail: item.abortOnFail,
      })),
      signers: signers || [],
      attributes: attributes || [],
      extraSystemFee: options?.extraSystemFee
        ? new BigNumber(options.extraSystemFee).shiftedBy(-8).toFixed()
        : undefined,
      overrideSystemFee: options?.suggestedSystemFee
        ? new BigNumber(options.suggestedSystemFee).shiftedBy(-8).toFixed()
        : undefined,
      validUntilBlock: options?.validUntilBlock,
      hostname: location.hostname,
    };
  }

  private async sendAuthorizedMessage<T>(
    target: requestTargetN3,
    parameter?: any,
  ): Promise<T> {
    const isAuth = await checkNeoXConnectAndLogin('Neo3');
    if (isAuth !== true) {
      throw {
        code: NEP21ErrorCode.CANCELED,
        message: `The user cancelled the request`,
      };
    }

    return sendMessage<T>(target, parameter).catch((error) => {
      throw normalizeError(error);
    });
  }
}

const provider = new Proxy(new NEOLineN3Controller(), {
  get: (instance, property) => instance[property],
  deleteProperty: () => true,
});

window.addEventListener('message', (event) => {
  const response = event.data;

  switch (response.return) {
    case EVENT_N3.INIT_DAPI:
      const { connected, currentNetwork } = response.data;
      provider.connected = connected;
      provider.network = currentNetwork.magicNumber;
      announceProvider();
      break;
    case EVENT.ACCOUNT_CHANGED:
      provider.connected = Array.isArray(response.data)
        ? response.data.length > 0
        : !!response.data;
      provider.emit(EventNameEnum.ACCOUNTS_CHANGED, response.data);
      break;
    case EVENT.NETWORK_CHANGED:
      const { chainId } = response.data || {};
      let network: Network | undefined;

      if (chainId === N3MainnetNetwork.chainId) {
        network = N3MainnetNetwork.magicNumber;
      } else if (chainId === N3TestnetNetwork.chainId) {
        network = N3TestnetNetwork.magicNumber;
      }

      if (network != null) {
        provider.network = network;
        provider.emit(EventNameEnum.NETWORK_CHANGED, network);
      }
      break;
  }
});

window.addEventListener('Neo.DapiProvider.request', announceProvider);

function announceProvider() {
  window.dispatchEvent(
    new CustomEvent('Neo.DapiProvider.ready', {
      detail: Object.freeze({ provider }),
    }),
  );
}

function assertAuthenticationPayload(payload: AuthenticationChallengePayload) {
  if (
    !payload ||
    payload.action !== 'Authentication' ||
    payload.grant_type !== 'Signature' ||
    !Array.isArray(payload.allowed_algorithms) ||
    !payload.domain ||
    !Array.isArray(payload.networks) ||
    !payload.nonce ||
    payload.timestamp === undefined
  ) {
    throw {
      code: NEP21ErrorCode.INVALID,
      message: `'payload' must be a valid authentication challenge payload`,
    };
  }
}

function assertInvocation(invocation: InvocationArguments) {
  if (!invocation?.hash || !invocation?.operation) {
    throw {
      code: NEP21ErrorCode.INVALID,
      message: `'invocation' must be a valid invocation arguments`,
    };
  }
}

function assertSupportedTransactionOptions(
  attributes?: TransactionAttributeJson[],
  options?: TransactionOptions,
) {
  if (attributes !== undefined && !Array.isArray(attributes)) {
    throw {
      code: NEP21ErrorCode.INVALID,
      message: `'attributes' must be an array`,
    };
  }

  if (
    options?.extraSystemFee !== undefined &&
    !isValidIntegerAmount(options.extraSystemFee)
  ) {
    throw {
      code: NEP21ErrorCode.INVALID,
      message: `'extraSystemFee' must be a positive integer in string format`,
    };
  }

  if (
    options?.suggestedSystemFee !== undefined &&
    !isValidIntegerAmount(options.suggestedSystemFee)
  ) {
    throw {
      code: NEP21ErrorCode.INVALID,
      message: `'suggestedSystemFee' must be a positive integer in string format`,
    };
  }

  if (
    options?.validUntilBlock !== undefined &&
    (!Number.isInteger(options.validUntilBlock) || options.validUntilBlock < 0)
  ) {
    throw {
      code: NEP21ErrorCode.INVALID,
      message: `'validUntilBlock' must be a non-negative integer`,
    };
  }
}

function isValidIntegerAmount(amount: Integer): boolean {
  if (typeof amount === 'number') {
    return Number.isSafeInteger(amount) && amount >= 0;
  }

  if (typeof amount === 'string') {
    return (
      /^\d+$/.test(amount) &&
      new BigNumber(amount).isFinite() &&
      new BigNumber(amount).isInteger()
    );
  }

  return false;
}

function isUint256(param: UInt256): boolean {
  return typeof param === 'string' && /^(0x)?[0-9a-fA-F]{64}$/.test(param);
}

function normalizeError(legacyError: any): NEP21Error {
  let error: NEP21Error = {
    code: NEP21ErrorCode.UNKNOWN,
    message: legacyError.description,
    data: legacyError.data,
  };
  switch (legacyError?.type) {
    case LEGACY_ERRORS.CHAIN_NOT_MATCH.type:
    case LEGACY_ERRORS.UNSUPPORTED.type:
    case LEGACY_ERRORS.UNAUTHORIZED.type:
      error.code = NEP21ErrorCode.UNSUPPORTED;
      break;
    case LEGACY_ERRORS.MALFORMED_INPUT.type:
      error.code = NEP21ErrorCode.INVALID;
      break;
    case LEGACY_ERRORS.FAILED.type:
      error.code = NEP21ErrorCode.FAILED;
      break;
    case LEGACY_ERRORS.CANCELLED.type:
    case LEGACY_ERRORS.CONNECTION_DENIED.type:
      error.code = NEP21ErrorCode.CANCELED;
      break;
    case LEGACY_ERRORS.INSUFFICIENT_FUNDS.type:
      error.code = NEP21ErrorCode.INSUFFICIENT_FUNDS;
      break;
    case LEGACY_ERRORS.RPC_ERROR.type:
      error.code = NEP21ErrorCode.RPC_ERROR;
      break;
    default:
      error.code = NEP21ErrorCode.UNKNOWN;
      break;
  }
  return error;
}

function stripHexPrefix(value: string) {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function buildContractParametersContext(
  serializedTx: string,
  network: Network,
  options: {
    accounts?: Account[];
    seedItems?: ContractParametersContext['items'];
    requireAllScripts?: boolean;
  } = {},
  hash?: UInt256,
): ContractParametersContext {
  const transaction = tx.Transaction.deserialize(stripHexPrefix(serializedTx));
  const accountsByHash = createAccountMap(options.accounts || []);
  const items = transaction.signers.reduce((acc, signer) => {
    const account = signer.account.toBigEndian();
    const seedItem = options.seedItems?.[account];
    const accountInfo = accountsByHash[account];
    const witness = transaction.witnesses.find((item) => {
      try {
        return item.scriptHash === account;
      } catch (_) {
        return false;
      }
    });
    const witnessVerificationScript = ensureSignerVerificationScript(
      account,
      witness?.verificationScript?.toBigEndian(),
    );
    const seedVerificationScript = ensureSignerVerificationScript(
      account,
      decodeContextScript(seedItem?.script),
    );
    const accountVerificationScript = ensureSignerVerificationScript(
      account,
      decodeContextScript(accountInfo?.contract?.script),
    );
    const verificationScript =
      witnessVerificationScript ||
      seedVerificationScript ||
      accountVerificationScript ||
      '';
    const base64VerificationScript = verificationScript
      ? Buffer.from(verificationScript, 'hex').toString('base64')
      : '';

    if (options.requireAllScripts && !verificationScript) {
      throw {
        code: NEP21ErrorCode.UNSUPPORTED,
        message: `Unable to resolve verification script for signer ${account}`,
      };
    }

    const invocationScript = witness?.invocationScript?.toBigEndian() || '';
    let signatures: Record<string, string> = {
      ...(verificationScript ? seedItem?.signatures || {} : {}),
    };

    if (verificationScript && invocationScript) {
      try {
        // 把已有 invocation script 还原成 publicKey -> signature 的映射。
        // Reconstruct the existing invocation script into a publicKey -> signature map.
        const publicKeys =
          wallet3.getPublicKeysFromVerificationScript(verificationScript);
        const signedValues =
          wallet3.getSignaturesFromInvocationScript(invocationScript);

        signatures = publicKeys.reduce(
          (output, publicKey, signatureIndex) => {
            const signature = signedValues[signatureIndex];
            if (signature) {
              output[publicKey] = Buffer.from(signature, 'hex').toString(
                'base64',
              );
            }
            return output;
          },
          { ...(seedItem?.signatures || {}) },
        );
      } catch (_) {}
    }

    acc[account] = {
      script: base64VerificationScript,
      parameters: buildContextParameters(
        verificationScript,
        verificationScript ? seedItem?.parameters : [],
        accountInfo?.contract?.parameters,
        signatures,
      ),
      signatures,
    };

    return acc;
  }, {});

  return {
    type: 'Neo.Network.P2P.Payloads.Transaction',
    hash: hash || transaction.hash(),
    data: hex2base64(transaction.serialize(true)),
    items,
    network,
  };
}

function createAccountMap(accounts: Account[]) {
  return accounts.reduce(
    (acc, account) => {
      acc[account.hash] = account;
      return acc;
    },
    {} as Record<string, Account>,
  );
}

function decodeContextScript(script?: string) {
  if (!script) {
    return '';
  }

  const normalized = stripHexPrefix(script);

  if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
    // 有些调用方直接传 hex，NEP-21 context 里通常则是 base64。
    // Some callers pass hex directly, while NEP-21 contexts usually use base64.
    return normalized;
  }

  return Buffer.from(script, 'base64').toString('hex');
}

function ensureSignerVerificationScript(
  signerHash: string,
  verificationScript?: string,
) {
  if (!verificationScript) {
    return '';
  }

  try {
    return wallet3.getScriptHashFromVerificationScript(verificationScript) ===
      stripHexPrefix(signerHash)
      ? verificationScript
      : '';
  } catch (_) {
    return '';
  }
}

function buildContextParameters(
  verificationScript: string,
  seedParameters: Argument[] = [],
  contractParameters: Array<{ type: Argument['type']; name?: string }> = [],
  signatures: Record<string, string> = {},
): Argument[] {
  const orderedSignatureValues = getOrderedSignatureValues(
    verificationScript,
    signatures,
  );
  // 优先复用调用方或账户自带的参数模板，保持 parameter name 稳定。
  // Reuse the caller-provided or account-level parameter template first to keep parameter names stable.
  const template =
    seedParameters.length > 0
      ? seedParameters
      : contractParameters.map((parameter) => ({
          name: parameter.name,
          type: parameter.type,
        }));

  if (template.length > 0) {
    return template.map((parameter, index) => ({
      ...parameter,
      value:
        parameter.type === 'Signature'
          ? orderedSignatureValues[index]
          : parameter.value,
    }));
  }

  if (!verificationScript) {
    return [];
  }

  try {
    const publicKeys =
      wallet3.getPublicKeysFromVerificationScript(verificationScript);

    if (publicKeys.length === 0) {
      return [];
    }

    const threshold =
      publicKeys.length > 1
        ? wallet3.getSigningThresholdFromVerificationScript(
            verificationScript,
          ) || 1
        : 1;

    return Array.from({ length: threshold }, (_, index) => ({
      type: 'Signature' as const,
      value: orderedSignatureValues[index],
    }));
  } catch (_) {
    return [];
  }
}

function getOrderedSignatureValues(
  verificationScript: string,
  signatures: Record<string, string>,
) {
  if (!verificationScript) {
    return Object.values(signatures);
  }

  try {
    // 让 parameter 顺序与 verification script 对齐，保证多签槽位顺序稳定。
    // Align parameter order with the verification script so multi-sig slots stay stable.
    return wallet3
      .getPublicKeysFromVerificationScript(verificationScript)
      .map((publicKey) => signatures[publicKey])
      .filter(Boolean);
  } catch (_) {
    return Object.values(signatures);
  }
}
