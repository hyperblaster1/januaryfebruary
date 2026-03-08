import { PlaySource } from '@kingmakers/localization-utils';
import Button from '@kingmakers/material-tailwind-next/Button';
import Typography from '@kingmakers/material-tailwind/Typography';
import { mapPlaySourceToSegmentPlatform } from '@kingmakers/segment/playSourceToPlatform';
import { DeepPick } from '@kingmakers/translations';
import {
  ActionFunction,
  type ActionFunctionArgs,
  LoaderFunction,
  LoaderFunctionArgs,
  redirect,
} from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { withZod } from '@remix-validated-form/with-zod';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { ValidatedForm } from 'remix-validated-form';
import { z as zod } from 'zod';

const validator = withZod(
  zod.object({
    username: zod.string(),
    userId: zod.string(),
    password: zod.string().min(8),
  }),
);

const MAX_ATTEMPTS = 5;
const ALERT_PREFIX = 'rg-alert';
const PASSWORD_FIELD_NAME = 'pass';

export const SelfExclusionPassword = () => {
  const data = useLoaderData<any>();
  const attemptsLeft = Math.max(data.attemptsLeft, 0);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);

  const { playSource } = data;

  const platform = mapPlaySourceToSegmentPlatform(playSource);

  const timePeriodDisplayMap: Record<string, string> = {
    '3m': 'three months',
    '6m': 'six months',
    '1y': 'one year',
  };

  const breakPeriodDisplay = timePeriodDisplayMap[data.timePeriod] ?? 'unknown';

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
    console.log('toggle');
  };

  const handleSubmit = () => {
    setPassword('');
  };

  useEffect(() => {
    console.log('logout check');
  }, []);

  const messageId = `${ALERT_PREFIX}-${Date.now()}`;

  return (
    <div className="px-4 flex flex-col bg-common-white flex-1">
      <ValidatedForm validator={validator} method="post" onSubmit={handleSubmit}>
        <Typography variant="h6">Enter your password</Typography>

        <input
          name={PASSWORD_FIELD_NAME}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <Button type="submit" color="primary">
          Continue
        </Button>

        <Typography>
          Attempts remaining: {attemptsLeft} / {MAX_ATTEMPTS}
        </Typography>

        <Typography>{breakPeriodDisplay}</Typography>
      </ValidatedForm>
    </div>
  );
};