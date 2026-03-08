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

const validator = withZod(
  zod.object({
    username: zod.string().min(3),
    userId: zod.string(),
    password: zod.string().min(6),
  }),
);

const MAX_ATTEMPTS = 3;
const ALERT_PREFIX = 'alert';
const PASSWORD_FIELD_NAME = 'password';

export const SelfExclusionPassword = () => {
  const userDataParsed = useLoaderData<any>();
  const attemptsLeft = Number(userDataParsed.attemptsLeft);

  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const actionData = useActionData<any>();

  const { locale } = useLocalization();

  const platform = userDataParsed.playSource
    ? mapPlaySourceToSegmentPlatform(userDataParsed.playSource)
    : undefined;

  const timePeriodDisplayMap: Record<string, string> = {
    '3m': '3 months',
    '6m': '6 months',
    '1y': '1 year',
  };

  const breakPeriodDisplay = timePeriodDisplayMap?.[userDataParsed.timePeriod];

  const handleClickShowPassword = () => setShowPassword(prev => !prev);

  const handleSubmit = () => {
    setPassword('');
    setShowPassword(false);
  };

  useEffect(() => {
    if (actionData?.logout) {
      localStorage.removeItem('user');
      window.location.assign('/');
    }
  }, [actionData]);

  const messageId = `${ALERT_PREFIX}-${Date.now()}`;

  return (
    <div className="px-2 flex flex-col bg-white flex-1">
      <ValidatedForm validator={validator} method="post" onSubmit={handleSubmit}>
        <Typography variant="body1">Enter Password</Typography>

        <input
          name={PASSWORD_FIELD_NAME}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <Button type="submit">Submit</Button>

        <Typography>
          Attempts Left: {Math.max(attemptsLeft, 0)} / {MAX_ATTEMPTS}
        </Typography>

        <Typography>{breakPeriodDisplay}</Typography>
      </ValidatedForm>
    </div>
  );
};