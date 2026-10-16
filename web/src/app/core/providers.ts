import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { HttpJobsGateway } from '../jobs/http-jobs.gateway';
import { JobsGateway } from '../jobs/jobs.gateway';
import { HttpSettingsGateway } from '../settings/http-settings.gateway';
import { SettingsGateway } from '../settings/settings.gateway';
import { HttpToolsGateway } from '../tools/http-tools.gateway';
import { ToolsGateway } from '../tools/tools.gateway';

/** Liga os gateways à API do app local (`/api`, servida pelo mesmo endereço da página). */
export function provideLocalApi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: JobsGateway, useClass: HttpJobsGateway },
    { provide: SettingsGateway, useClass: HttpSettingsGateway },
    { provide: ToolsGateway, useClass: HttpToolsGateway },
  ]);
}
