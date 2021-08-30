/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { OAuthApi } from '@backstage/core-plugin-api';
import {
  ScmAuthApi,
  ScmAuthTokenOptions,
  ScmAuthTokenResponse,
} from './ScmAuthApi';

type ScopeMapping = {
  default: string[];
  repoWrite: string[];
};

class ScmAuthMux implements ScmAuthApi {
  #providers = new Array<ScmAuth>();

  constructor(providers: ScmAuth[]) {
    this.#providers = providers;
  }

  async getCredentials(
    options: ScmAuthTokenOptions,
  ): Promise<ScmAuthTokenResponse> {
    const url = new URL(options.url);
    const provider = this.#providers.find(p => p.isUrlSupported(url));
    if (!provider) {
      throw new Error(
        `No authentication provider available for access to '${options.url}'`,
      );
    }

    return provider.getCredentials(options);
  }
}

export class ScmAuth implements ScmAuthApi {
  static forAuthApi(
    authApi: OAuthApi,
    options: {
      host: string;
      scopeMapping: {
        default: string[];
        repoWrite: string[];
      };
    },
  ): ScmAuth {
    return new ScmAuth(authApi, options.host, options.scopeMapping);
  }

  static forGithub(
    githubAuthApi: OAuthApi,
    options?: {
      host?: string;
    },
  ): ScmAuth {
    const host = options?.host ?? 'github.com';
    return new ScmAuth(githubAuthApi, host, {
      default: ['repo', 'read:org', 'read:user'],
      repoWrite: ['repo', 'read:org', 'read:user', 'gist'],
    });
  }

  static forGitlab(
    gitlabAuthApi: OAuthApi,
    options?: {
      host?: string;
    },
  ): ScmAuth {
    const host = options?.host ?? 'gitlab.com';
    return new ScmAuth(gitlabAuthApi, host, {
      default: ['read_user', 'read_api', 'read_repository'],
      repoWrite: ['read_user', 'read_api', 'write_repository', 'api'],
    });
  }

  static forAzure(
    microsoftAuthApiRef: OAuthApi,
    options?: {
      host?: string;
    },
  ): ScmAuth {
    const host = options?.host ?? 'dev.azure.com';
    return new ScmAuth(microsoftAuthApiRef, host, {
      default: [
        'vso.build',
        'vso.code',
        'vso.graph',
        'vso.project',
        'vso.profile',
      ],
      repoWrite: [
        'vso.build',
        'vso.code_manage',
        'vso.graph',
        'vso.project',
        'vso.profile',
      ],
    });
  }

  static forBitbucket(
    bitbucketAuthApi: OAuthApi,
    options?: {
      host?: string;
    },
  ): ScmAuth {
    const host = options?.host ?? 'bitbucket.org';
    return new ScmAuth(bitbucketAuthApi, host, {
      default: ['account', 'team', 'pullrequest', 'snippet', 'issue'],
      repoWrite: [
        'account',
        'team',
        'pullrequest:write',
        'snippet:write',
        'issue:write',
      ],
    });
  }

  /**
   * Merges together multiple ScmAuth instances into one that
   * routes requests to the correct instance based on the URL.
   */
  static merge(...providers: ScmAuth[]): ScmAuthApi {
    return new ScmAuthMux(providers);
  }

  #api: OAuthApi;
  #host: string;
  #scopeMapping: ScopeMapping;

  private constructor(api: OAuthApi, host: string, scopeMapping: ScopeMapping) {
    this.#api = api;
    this.#host = host;
    this.#scopeMapping = scopeMapping;
  }

  /**
   * Checks whether the implementation is able to provide authentication for the given URL.
   */
  isUrlSupported(url: URL): boolean {
    return url.host === this.#host;
  }

  async getCredentials(
    options: ScmAuthTokenOptions,
  ): Promise<ScmAuthTokenResponse> {
    const { url, additionalScope, ...restOptions } = options;
    const scopes = additionalScope?.repoWrite
      ? this.#scopeMapping.repoWrite
      : this.#scopeMapping.default;

    const token = await this.#api.getAccessToken(scopes, restOptions);
    return {
      token,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }
}
