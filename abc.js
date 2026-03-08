import { PlaySource, useLocalization } from '@kingmakers/localization-utils';
import Button from '@kingmakers/material-tailwind-next/Button';
import Typography from '@kingmakers/material-tailwind-next/Typography';
import { mapPlaySourceToSegmentPlatform } from '@kingmakers/segment/playSourceToPlatform';
import { DeepPick, useTranslations } from '@kingmakers/translations';
import {
  ActionFunction,
  type ActionFunctionArgs,
  LoaderFunction,
  LoaderFunctionArgs,
  redirect,
} from '@remix-run/cloudflare';
import { useActionData, useLoaderData } from '@remix-run/react';
import { withZod } from '@remix-validated-form/with-zod';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { ValidatedForm } from 'remix-validated-form';
import { z as zod } from 'zod';

import ForgottenPasswordLink from '~/components/ForgottenPasswordLink';
import { type HeaderHandle } from '~/components/Header/Header';
import { ProgressTracker } from '~/components/ProgressTracker';
import RGPasswordInput from '~/components/RGPasswordInput';
import {
  BrowserCookieStorage,
  LOCAL_STORAGE_USER_DATA_KEY,
  ResponsibleGamingFlow,
  SessionName,
} from '~/const/constants';
import { type TTranslations } from '~/const/translations';
import { SegmentEventImportance, SegmentKey, useSegment } from '~/hooks/useSegment';
import { errorReport } from '~/lib/errorReport';
import { Routes } from '~/routes.config';
import { type GetProfileResponseV2 } from '~/services/bff-account';
import { type ResponsibleGamingSegmentEvents, SegmentEventName } from '~/types/segment-events';
import { deleteCookie } from '~/utils/genericUtils';
import { getBrandDetailsFromRequest } from '~/utils/getBrandDetailsFromRequest';
import { handleServiceError, ServiceError } from '~/utils/handleServiceError';
import { getSessionFromRequest } from '~/utils/session';

const validator = withZod(
  zod.object({
    username: zod.string(),
    userId: zod.string(),
    password: zod.string(),
  }),
);

type LoaderData = {
  rawTranslations: DeepPick<TTranslations, ['selfExclusion']>;
  profileData: GetProfileResponseV2;
  timePeriod: string;
  attemptsLeft: number;
  playSource: PlaySource | undefined;
};

type ActionData = {
  logout?: boolean;
  alertMessage?: string;
};

export const loader: LoaderFunction = async ({ request, context }: LoaderFunctionArgs) => {
  const { bffAccount, routes, localizationInfo, translationsService } = context;
  try {
    const [profileDataResponse, { rawTranslations }, session] = await Promise.all([
      bffAccount.getUserProfile(),
      translationsService.getTranslations('selfExclusion'),
      context.sessionStorage.getSession(request.headers.get('Cookie')),
    ]);
    const profileData = profileDataResponse.data;

    const futureDate = session.get(SessionName.FUTURE_DATE);
    const timePeriod = session.get('timePeriod') ?? '';
    const attemptsLeft = session.get(SessionName.ATTEMPTS_LEFT) ?? 3;

    if (!session.has(SessionName.ATTEMPTS_LEFT)) {
      session.set(SessionName.ATTEMPTS_LEFT, attemptsLeft.toString());
      await context.sessionStorage.commitSession(session);
    }
    return Response.json({
      profileData,
      futureDate,
      timePeriod,
      attemptsLeft,
      rawTranslations,
      playSource: localizationInfo?.playSource,
    });
  } catch (e: unknown) {
    errorReport('Error in SelfExclusionPassword loader', e as Error);
    return handleServiceError({
      error: e as ServiceError,
      context: 'SelfExclusionPassword loader',
      currentPath: routes.linkTo(Routes.SelfExclusionPassword),
    });
  }
};

export const action: ActionFunction = async ({
  request,
  context: { bffAccount, translationsService, env, sessionStorage },
}: ActionFunctionArgs) => {
  const formData = await request.formData();
  const { brandId } = getBrandDetailsFromRequest({ request, env });

  const password = formData.get('password') as string;
  const username = formData.get('username') as string;
  const userId = Number(formData.get('userId') ?? '');

  const session = await getSessionFromRequest(sessionStorage, request);

  let attemptsLeft = Number(session.get(SessionName.ATTEMPTS_LEFT) ?? 3);

  if (attemptsLeft <= 0) {
    return redirect('/');
  }

  try {
    await bffAccount.login({
      username,
      password,
      grant_type: 'password',
      brandId,
    });

    session.unset(SessionName.ATTEMPTS_LEFT);

    const futureDate = session.get(SessionName.FUTURE_DATE) || '';

    await bffAccount.createResponsibleGamingTicket({
      userId,
      category: 2,
      effectiveTillDate: futureDate,
      reasonId: 0,
    });

    const { rawTranslations } = await translationsService.getTranslations('selfExclusion');
    const formattedDate = dayjs(futureDate).format('DD/MM/YYYY');
    const alertMessage = (rawTranslations.alertMessage as string).replace('%{date}', formattedDate);

    await bffAccount.logOut();

    return Response.json(
      { logout: true, alertMessage },
      {
        headers: {
          'Set-Cookie': `${BrowserCookieStorage.PRODUCT_RESTRICTIONS}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`,
        },
      },
    );
  } catch (error) {
    errorReport('SelfExclusionPassword action error', error as Error);
    attemptsLeft -= 1;
    session.set(SessionName.ATTEMPTS_LEFT, attemptsLeft.toString());

    if (attemptsLeft <= 0) {
      await bffAccount.logOut();
      session.set(SessionName.ATTEMPTS_LEFT, '3');
      const headers = new Headers();
      headers.append(
        'Set-Cookie',
        `${BrowserCookieStorage.PRODUCT_RESTRICTIONS}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`,
      );
      headers.append('Set-Cookie', await sessionStorage.commitSession(session));

      const { rawTranslations } = await translationsService.getTranslations('selfExclusion');
      const futureDate = session.get(SessionName.FUTURE_DATE) || '';
      const formattedDate = dayjs(futureDate).format('DD/MM/YYYY');
      const alertMessage = (rawTranslations.alertMessage as string).replace('%{date}', formattedDate);

      return Response.json(
        { logout: true, alertMessage },
        {
          headers,
        },
      );
    }
  }

  return new Response(null, {
    headers: {
      'Set-Cookie': await sessionStorage.commitSession(session),
    },
  });
};

export const handle: HeaderHandle = {
  headerTitle: 'selfExclusion',
  showCloseButton: true,
};

export const SelfExclusionPassword = () => {
  const userDataParsed = useLoaderData<LoaderData>();
  const {
    rawTranslations,
    profileData: {
      userDetails: { userId, username },
    },
    timePeriod,
    playSource,
  } = userDataParsed;

  const { t } = useTranslations(rawTranslations);
  const attemptsLeft = userDataParsed.attemptsLeft;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const actionData = useActionData<ActionData>();
  const { locale } = useLocalization();
  const { trackSegmentEvent, resetUserInSegment, identifySegmentUser } = useSegment<ResponsibleGamingSegmentEvents>(
    locale,
    SegmentKey.Login,
  );
  const platform = playSource ? mapPlaySourceToSegmentPlatform(playSource) : undefined;

  const timePeriodDisplayMap: Record<string, string> = {
    '3m': '3 months',
    '6m': '6 months',
    '1y': '1 year',
    '2y': '2 years',
    '3y': '3 years',
    '4y': '4 years',
    '5y': '5 years',
  };

  const breakPeriodDisplay = timePeriodDisplayMap[timePeriod];

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = () => {
    setPassword('');
    if (breakPeriodDisplay && platform) {
      trackSegmentEvent(
        {
          event: SegmentEventName.ResponsibleGamingSubmitted,
          properties: {
            platform,
            flow: ResponsibleGamingFlow.SelfExclusion,
            period: breakPeriodDisplay,
          },
          options: { userId: String(userId) },
        },
        SegmentEventImportance.Important,
      );
    }
  };

  useEffect(() => {
    if (actionData?.logout) {
      // Track responsible_gaming_success event
      if (breakPeriodDisplay && userId && platform) {
        trackSegmentEvent(
          {
            event: SegmentEventName.ResponsibleGamingSuccess,
            properties: {
              platform,
              flow: ResponsibleGamingFlow.SelfExclusion,
              period: breakPeriodDisplay,
            },
            options: { userId: String(userId) },
          },
          SegmentEventImportance.Important,
        );
      }

      // Identify user with RG traits
      if (breakPeriodDisplay && userId) {
        identifySegmentUser(String(userId), {
          responsible_gaming_status: ResponsibleGamingFlow.SelfExclusion,
          responsible_gaming_period: breakPeriodDisplay,
        });
      }

      resetUserInSegment();

      deleteCookie('refreshToken');
      deleteCookie('accessToken');
      localStorage.removeItem(LOCAL_STORAGE_USER_DATA_KEY);
      window.parent.postMessage({ command: 'user_logout' }, window.location.origin);

      // Store alert message in session storage similar to TakeABreakPassword
      if (actionData.alertMessage) {
        const messageId = `alert-${Date.now()}`;

        sessionStorage.setItem(
          messageId,
          JSON.stringify({
            message: actionData.alertMessage,
            confirmed: false,
          }),
        );

        sessionStorage.setItem('latestAlertId', messageId);
      }

      window.location.href = '/';
    }
  }, [actionData, userId, breakPeriodDisplay, resetUserInSegment, platform, trackSegmentEvent, identifySegmentUser]);

  return (
    <div className="px-2 flex flex-col bg-common-white flex-1 w-full max-w-xl mx-auto justify-between">
      <ValidatedForm validator={validator} className="h-full" method="post" onSubmit={handleSubmit}>
        <ProgressTracker classes="!p-0" testId="step-three" noOfSteps={3} selectedStep={3} />

        <div className="flex flex-col justify-start p-1">
          <Typography variant="body1" className="leading-6 pb-2" color="contrastText" data-testid="title-your-id">
            {t('enterPasswordLabel')}
          </Typography>
          <Typography variant="body2" className="mb-1" data-testid="txt-upload-instructions">
            {t('selfExclusionPasswordPagePreText')} <b>{breakPeriodDisplay}</b>
          </Typography>
          <Typography variant="body2" className="mb-1" data-testid="txt-upload-instructions">
            {t('selfExclusionPasswordPagePostText')}
          </Typography>
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="userId" value={userId} />
          <RGPasswordInput
            value={password}
            onChange={e => setPassword(e.target.value)}
            showPassword={showPassword}
            onShowPasswordClick={handleClickShowPassword}
            attemptsLeft={attemptsLeft}
          />
          <Button
            type="submit"
            className="self-center mt-2 px-4"
            variant="contained"
            color="highlight"
            rounded
            size="large"
            data-testid="btn-next"
          >
            {t('selfExcludeNowButton')}
          </Button>
        </div>
      </ValidatedForm>
      <ForgottenPasswordLink />
    </div>
  );
};
