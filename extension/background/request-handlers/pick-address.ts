import { requestTarget } from '../../common/data_module_neo2';
import { requestTargetN3 } from '../../common/data_module_neo3';
import { createWindow } from '../tool';
import { RequestHandlerModule } from './context';

const pickAddressNeo2: RequestHandlerModule = {
  targets: [requestTarget.PickAddress],
  handle: ({ request }) => {
    createWindow(
      `pick-address?hostname=${request.parameter.hostname}&chainType=Neo2&messageID=${request.ID}`
    );
    return true;
  },
};

const pickAddressNeo3: RequestHandlerModule = {
  targets: [requestTargetN3.PickAddress],
  handle: ({ request }) => {
    createWindow(
      `pick-address?hostname=${request.parameter.hostname}&chainType=Neo3&messageID=${request.ID}`
    );
    return true;
  },
};

export default [pickAddressNeo2, pickAddressNeo3];
