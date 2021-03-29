/* eslint-disable no-use-before-define */

import { ApiSite } from './ApiSite';

export type PlejdApi = {
  config: any;
  deviceRegistry: any;
  sessionToken: string;
  siteId: string;
  siteDetails: ApiSite;
};
